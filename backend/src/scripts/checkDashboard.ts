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
  const rows = await db('service_requests').select('id').where('title', 'like', 'DashTest%');
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
    console.log('Testing Phase 8: Dashboard Counts, Developer Workload & Audit History...');

    const managerToken = await loginAs('nimal.manager@northwind.test', password);
    const devKamalToken = await loginAs('kamal.dev@northwind.test', password);
    const adminToken = await loginAs('admin@servicedesk.test', password);

    // 1. System Admin cannot view request dashboard
    const adminRes = await api('GET', '/api/dashboard', { token: adminToken });
    check(adminRes.status === 403, 'System Admin cannot access request dashboard (403)');

    // 2. Manager accesses dashboard
    const mgrRes = await api('GET', '/api/dashboard', { token: managerToken });
    check(mgrRes.status === 200, 'Manager can view dashboard');
    check(
      typeof mgrRes.body?.counts?.total === 'number' &&
        typeof mgrRes.body?.counts?.pending === 'number' &&
        typeof mgrRes.body?.counts?.active === 'number' &&
        typeof mgrRes.body?.counts?.completed === 'number' &&
        typeof mgrRes.body?.counts?.overdue === 'number',
      'Manager dashboard returns total, pending, active, completed, overdue counts'
    );
    check(Array.isArray(mgrRes.body?.workload), 'Manager dashboard returns developer workload array');
    if (mgrRes.body?.workload?.length > 0) {
      check(
        typeof mgrRes.body.workload[0].id === 'number' &&
          typeof mgrRes.body.workload[0].name === 'string' &&
          typeof mgrRes.body.workload[0].activeRequestsCount === 'number',
        'Developer workload contains developer id, name, and activeRequestsCount'
      );
    }

    // 3. Developer accesses dashboard
    const devRes = await api('GET', '/api/dashboard', { token: devKamalToken });
    check(devRes.status === 200, 'Developer can view dashboard');
    check(
      typeof devRes.body?.counts?.total === 'number' &&
        typeof devRes.body?.counts?.pendingAction === 'number' &&
        typeof devRes.body?.counts?.inProgress === 'number' &&
        typeof devRes.body?.counts?.completed === 'number' &&
        typeof devRes.body?.counts?.overdue === 'number',
      'Developer dashboard returns counts scoped to their assigned work'
    );
    check(devRes.body?.workload === undefined, 'Developer dashboard does not expose other developer workloads');

    // 4. Test request audit trail endpoint
    const createRes = await api('POST', '/api/requests', {
      token: managerToken,
      json: {
        title: 'DashTest Audit Request',
        description: 'For testing audit endpoint',
        priority: 'Low',
        category: 'Maintenance',
        deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    const reqId = createRes.body.request.id;

    const auditRes = await api('GET', `/api/requests/${reqId}/audit`, { token: managerToken });
    check(auditRes.status === 200, 'Manager can fetch request audit history');
    check(
      Array.isArray(auditRes.body?.auditLogs) && auditRes.body.auditLogs.length > 0,
      'Audit logs returned as an array with entries'
    );
    check(
      auditRes.body.auditLogs[0].action === 'REQUEST_CREATED',
      'First audit log is REQUEST_CREATED'
    );

    // Developer cannot view audit logs
    const devAuditRes = await api('GET', `/api/requests/${reqId}/audit`, { token: devKamalToken });
    check(devAuditRes.status === 403, 'Developer cannot access request audit trail (403)');
  } finally {
    await cleanup();
    server.close();
  }

  console.log(`\nPhase 8 Results: ${passed} passed, ${failed} failed.`);
  await db.destroy();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup();
  await db.destroy();
  process.exit(1);
});