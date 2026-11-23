import type { AddressInfo } from 'node:net';
import { app } from '../app';
import { db } from '../db';

let passed = 0;
let failed = 0;
let baseUrl = '';

function check(ok: boolean, label: string, detail = ''): void {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
}

async function api(method: string, path: string, options: { token?: string; json?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.json !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
  });
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function loginAs(email: string, password: string): Promise<string> {
  const reply = await api('POST', '/api/auth/login', { json: { email, password } });
  if (reply.status !== 200) {
    throw new Error(`Could not log in as ${email}. Did you run npm run db:seed?`);
  }
  return reply.body.token;
}

async function cleanup(): Promise<void> {
  const rows = await db('service_requests').select('id').where('title', 'like', 'Phase7 Test%');
  const ids = rows.map((r: { id: number }) => r.id);
  if (ids.length > 0) {
    await db('audit_logs').whereIn('request_id', ids).del();
    await db('service_requests').whereIn('id', ids).del();
  }
}

async function main(): Promise<void> {
  const password = process.env.SEED_PASSWORD?.trim();
  if (!password) throw new Error('SEED_PASSWORD is missing in backend/.env');

  const server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await cleanup();

  try {
    console.log('Testing Phase 7: Assignments, Reassignments & Status Lifecycle...');

    const managerToken = await loginAs('nimal.manager@northwind.test', password);
    const devKamalToken = await loginAs('kamal.dev@northwind.test', password);
    const devSanduniToken = await loginAs('sanduni.dev@northwind.test', password);
    const devContosoToken = await loginAs('ruwan.dev@contoso.test', password);

    const devKamal = await db('users').where({ email: 'kamal.dev@northwind.test' }).first();
    const devSanduni = await db('users').where({ email: 'sanduni.dev@northwind.test' }).first();
    const devRuwan = await db('users').where({ email: 'ruwan.dev@contoso.test' }).first();

    // 1. Create a request
    const createRes = await api('POST', '/api/requests', {
      token: managerToken,
      json: {
        title: 'Phase7 Test Request',
        description: 'Testing full lifecycle',
        priority: 'High',
        category: 'Bug Fix',
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    check(createRes.status === 201, 'Request created in Submitted status');
    let req = createRes.body.request;

    // 2. Developer cannot review
    const devReview = await api('POST', `/api/requests/${req.id}/status`, {
      token: devKamalToken,
      json: { status: 'Under Review', version: req.version },
    });
    check(devReview.status === 403, 'Developer cannot move request to Under Review');

    // 3. Manager moves Submitted -> Under Review
    const reviewRes = await api('POST', `/api/requests/${req.id}/status`, {
      token: managerToken,
      json: { status: 'Under Review', version: req.version },
    });
    check(reviewRes.status === 200 && reviewRes.body.request.status === 'Under Review', 'Manager moves to Under Review');
    req = reviewRes.body.request;

    // 4. Assigning developer from another tenant must be rejected
    const crossTenantAssign = await api('POST', `/api/requests/${req.id}/assign`, {
      token: managerToken,
      json: { assigneeId: devRuwan.id, version: req.version },
    });
    check(crossTenantAssign.status === 400, 'Assigning developer from another tenant is rejected');

    // 5. Manager assigns to Kamal -> status becomes Assigned
    const assignRes = await api('POST', `/api/requests/${req.id}/assign`, {
      token: managerToken,
      json: { assigneeId: devKamal.id, version: req.version },
    });
    check(
      assignRes.status === 200 &&
        assignRes.body.request.status === 'Assigned' &&
        assignRes.body.request.assignee.id === devKamal.id,
      'Manager assigns request to active developer; status becomes Assigned'
    );
    req = assignRes.body.request;

    // Verify two audit entries were created
    const audits = await db('audit_logs').where({ request_id: req.id }).orderBy('id', 'asc');
    const actions = audits.map((a: { action: string }) => a.action);
    check(
      actions.includes('REQUEST_ASSIGNED') && actions.includes('STATUS_CHANGED'),
      'Initial assignment writes REQUEST_ASSIGNED and STATUS_CHANGED audit records'
    );

    // 6. Unassigned developer (Sanduni) cannot start work
    const wrongDevStart = await api('POST', `/api/requests/${req.id}/status`, {
      token: devSanduniToken,
      json: { status: 'In Progress', version: req.version },
    });
    check(wrongDevStart.status === 403 || wrongDevStart.status === 404, 'Unassigned developer cannot start work');

    // 7. Assigned developer (Kamal) starts work: Assigned -> In Progress
    const startRes = await api('POST', `/api/requests/${req.id}/status`, {
      token: devKamalToken,
      json: { status: 'In Progress', version: req.version },
    });
    check(startRes.status === 200 && startRes.body.request.status === 'In Progress', 'Assigned developer moves Assigned -> In Progress');
    req = startRes.body.request;

    // 8. Manager reassigns from Kamal to Sanduni (reason required)
    const noReasonReassign = await api('POST', `/api/requests/${req.id}/reassign`, {
      token: managerToken,
      json: { assigneeId: devSanduni.id, version: req.version, reason: '' },
    });
    check(noReasonReassign.status === 400, 'Reassignment without a reason is rejected');

    const reassignRes = await api('POST', `/api/requests/${req.id}/reassign`, {
      token: managerToken,
      json: { assigneeId: devSanduni.id, version: req.version, reason: 'Kamal is on leave' },
    });
    check(
      reassignRes.status === 200 &&
        reassignRes.body.request.assignee.id === devSanduni.id &&
        reassignRes.body.request.status === 'In Progress',
      'Manager reassigns to Sanduni with reason; status remains In Progress'
    );
    req = reassignRes.body.request;

    // 9. Sanduni completes request: In Progress -> Completed
    const completeRes = await api('POST', `/api/requests/${req.id}/status`, {
      token: devSanduniToken,
      json: { status: 'Completed', version: req.version },
    });
    check(
      completeRes.status === 200 &&
        completeRes.body.request.status === 'Completed' &&
        completeRes.body.request.completedAt !== null,
      'Assigned developer completes request; completedAt timestamp is set'
    );
    req = completeRes.body.request;

    // 10. Reopen requires reason
    const noReasonReopen = await api('POST', `/api/requests/${req.id}/status`, {
      token: managerToken,
      json: { status: 'Reopened', version: req.version },
    });
    check(noReasonReopen.status === 400, 'Reopening without a reason is rejected');

    // 11. Manager reopens with reason: Completed -> Reopened
    const reopenRes = await api('POST', `/api/requests/${req.id}/status`, {
      token: managerToken,
      json: { status: 'Reopened', version: req.version, reason: 'Issue still reproducible' },
    });
    check(
      reopenRes.status === 200 &&
        reopenRes.body.request.status === 'Reopened' &&
        reopenRes.body.request.completedAt === null,
      'Manager reopens request with reason; completedAt is cleared'
    );
  } finally {
    await cleanup();
    server.close();
  }

  console.log(`\nPhase 7 Results: ${passed} passed, ${failed} failed.`);
  await db.destroy();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup();
  await db.destroy();
  process.exit(1);
});