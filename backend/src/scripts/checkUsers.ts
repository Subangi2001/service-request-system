import type { AddressInfo } from 'node:net';
import { app } from '../app';
import { db } from '../db';
import { USER_COLUMNS, setUserActive, type UserRecord } from '../services/users';

// Checks the System Admin and Manager endpoints for organizations and users against a real running copy of the API.
// It creates temporary data (names starting with "check-users" / "Check Users") and removes it at the end.
// Run it with: npm run check:users

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

type Reply = { status: number; body: any };

async function api(method: string, path: string, options: { token?: string; json?: unknown } = {}): Promise<Reply> {
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

function expectError(reply: Reply, status: number, code: string, label: string): void {
  check(reply.status === status && reply.body?.error?.code === code, label, `got ${reply.status} ${reply.body?.error?.code}`);
}

async function loginAs(email: string, password: string): Promise<string> {
  const reply = await api('POST', '/api/auth/login', { json: { email, password } });
  if (reply.status !== 200) {
    throw new Error(`Could not log in as ${email} (status ${reply.status}). Did you run npm run db:seed?`);
  }
  return reply.body.token;
}

async function cleanup(): Promise<void> {
  // Remove everything this script created, including its audit entries.
  const users = await db('users').select('id').where('email', 'like', 'check-users-%');
  const ids = users.map((u: { id: number }) => u.id);
  if (ids.length > 0) {
    await db('audit_logs').whereIn('target_user_id', ids).del();
    await db('users').whereIn('id', ids).del();
  }
  await db('organizations').where('name', 'like', 'Check Users Org%').del();
}

async function auditCount(targetUserId: number): Promise<number> {
  const row = await db('audit_logs').where({ target_user_id: targetUserId, action: 'USER_DEACTIVATED' }).count({ total: '*' }).first();
  return Number(row?.total ?? 0);
}

async function main(): Promise<void> {
  const password = process.env.SEED_PASSWORD?.trim();
  if (!password) {
    throw new Error('SEED_PASSWORD is missing in backend/.env.');
  }

  const server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await cleanup();

  const northwind = await db('organizations').where({ name: 'Northwind Traders' }).first();
  const contoso = await db('organizations').where({ name: 'Contoso Ltd' }).first();
  if (!northwind || !contoso) {
    throw new Error('Demo organizations not found. Run: npm run db:seed');
  }

  try {
    console.log('Checking organization and user management...');

    // Two temporary developers used for the "must be refused" tests, so that real demo users are never at risk.
    const [homeDev] = await db('users')
      .insert({ organization_id: northwind.id, name: 'Check Home Dev', email: 'check-users-home-dev@servicedesk.test', password_hash: 'not-a-real-hash', role: 'developer' })
      .returning('id');
    const [crossDev] = await db('users')
      .insert({ organization_id: contoso.id, name: 'Check Cross Dev', email: 'check-users-cross-dev@servicedesk.test', password_hash: 'not-a-real-hash', role: 'developer' })
      .returning('id');

    const adminToken = await loginAs('admin@servicedesk.test', password);
    const managerToken = await loginAs('nimal.manager@northwind.test', password); // Northwind
    const otherManagerToken = await loginAs('ayesha.manager@contoso.test', password); // Contoso
    const developerToken = await loginAs('kamal.dev@northwind.test', password);

    // ---- Organizations (System Admin) ----
    console.log('\nOrganizations (System Admin)');
    expectError(await api('GET', '/api/organizations'), 401, 'UNAUTHENTICATED', 'No token is refused (401)');
    expectError(await api('GET', '/api/organizations', { token: managerToken }), 403, 'FORBIDDEN', 'A manager cannot list organizations (403)');
    expectError(await api('POST', '/api/organizations', { token: developerToken, json: { name: 'Check Users Org X' } }), 403, 'FORBIDDEN', 'A developer cannot create an organization (403)');

    const list = await api('GET', '/api/organizations', { token: adminToken });
    const northwindInfo = list.body?.organizations?.find((o: any) => o.name === 'Northwind Traders');
    check(list.status === 200 && northwindInfo?.managerCount === 1 && northwindInfo?.developerCount >= 2, 'Admin sees organizations with member counts');

    const created = await api('POST', '/api/organizations', { token: adminToken, json: { name: 'Check Users Org A' } });
    check(created.status === 201 && typeof created.body?.organization?.id === 'number', 'Admin creates an organization (201)');
    const newOrgId = created.body?.organization?.id;
    expectError(await api('POST', '/api/organizations', { token: adminToken, json: { name: 'Check Users Org A' } }), 409, 'ORGANIZATION_NAME_USED', 'Duplicate organization name is rejected (409)');
    const blank = await api('POST', '/api/organizations', { token: adminToken, json: { name: '   ' } });
    check(blank.status === 400 && !!blank.body?.error?.details?.fields?.name, 'Blank organization name returns 400 with details');

    // ---- Managers (System Admin) ----
    console.log('\nManagers (System Admin)');
    const newManager = await api('POST', `/api/organizations/${newOrgId}/managers`, {
      token: adminToken,
      json: { name: 'Check Manager', email: 'Check-Users-Manager@servicedesk.test', password: 'longenough123', role: 'system_admin', organizationId: northwind.id },
    });
    check(newManager.status === 201 && newManager.body?.user?.role === 'manager' && newManager.body?.user?.organizationId === newOrgId, 'Admin creates a manager; a forged role / organizationId in the body is ignored');
    check(!JSON.stringify(newManager.body).includes('password'), 'Response never contains a password or hash');
    check(newManager.body?.user?.email === 'check-users-manager@servicedesk.test', 'Email is stored in lower case');
    const newManagerId = newManager.body?.user?.id;

    expectError(await api('POST', `/api/organizations/${newOrgId}/managers`, { token: adminToken, json: { name: 'Dup', email: 'CHECK-USERS-MANAGER@servicedesk.test', password: 'longenough123' } }), 409, 'EMAIL_ALREADY_USED', 'Duplicate email (any letter case) is rejected (409)');
    const weak = await api('POST', `/api/organizations/${newOrgId}/managers`, { token: adminToken, json: { name: 'Weak', email: 'not-an-email', password: 'short' } });
    check(weak.status === 400 && !!weak.body?.error?.details?.fields?.email && !!weak.body?.error?.details?.fields?.password, 'Bad email and short password return 400 with details');
    expectError(await api('POST', '/api/organizations/999999/managers', { token: adminToken, json: { name: 'X', email: 'check-users-x@servicedesk.test', password: 'longenough123' } }), 404, 'NOT_FOUND', 'Manager for an organization that does not exist returns 404');
    expectError(await api('GET', '/api/organizations/abc/managers', { token: adminToken }), 400, 'VALIDATION_ERROR', 'A non-numeric id in the URL returns 400');

    const managerList = await api('GET', `/api/organizations/${newOrgId}/managers`, { token: adminToken });
    check(managerList.status === 200 && managerList.body?.managers?.length === 1, 'Admin lists the managers of an organization');

    // The new manager can log in.
    const loginNew = await api('POST', '/api/auth/login', { json: { email: 'check-users-manager@servicedesk.test', password: 'longenough123' } });
    check(loginNew.status === 200, 'The new manager can log in');

    // Activate / deactivate a manager (System Admin)
    const beforeAudit = await auditCount(newManagerId);
    const deactivated = await api('PATCH', `/api/organizations/${newOrgId}/managers/${newManagerId}/status`, { token: adminToken, json: { isActive: false } });
    check(deactivated.status === 200 && deactivated.body?.user?.isActive === false && deactivated.body?.changed === true, 'Admin deactivates a manager');
    check((await auditCount(newManagerId)) === beforeAudit + 1, 'Deactivation wrote an audit entry');
    const auditRow = await db('audit_logs').where({ target_user_id: newManagerId, action: 'USER_DEACTIVATED' }).first();
    const adminUser = await db('users').where({ email: 'admin@servicedesk.test' }).first();
    check(
      auditRow?.actor_id === adminUser.id && auditRow?.organization_id === newOrgId && auditRow?.request_id === null && auditRow?.old_value?.is_active === true && auditRow?.new_value?.is_active === false,
      'Audit entry records actor, organization, and before/after values'
    );
    expectError(await api('POST', '/api/auth/login', { json: { email: 'check-users-manager@servicedesk.test', password: 'longenough123' } }), 403, 'ACCOUNT_INACTIVE', 'A deactivated manager cannot log in');
    const again = await api('PATCH', `/api/organizations/${newOrgId}/managers/${newManagerId}/status`, { token: adminToken, json: { isActive: false } });
    check(again.status === 200 && again.body?.changed === false && (await auditCount(newManagerId)) === beforeAudit + 1, 'Deactivating twice changes nothing and logs nothing new');
    const reactivated = await api('PATCH', `/api/organizations/${newOrgId}/managers/${newManagerId}/status`, { token: adminToken, json: { isActive: true } });
    check(reactivated.status === 200 && reactivated.body?.user?.isActive === true && (await auditCount(newManagerId)) === beforeAudit + 1, 'Reactivating works and adds no audit entry (not required by the PDF)');
    const notBoolean = await api('PATCH', `/api/organizations/${newOrgId}/managers/${newManagerId}/status`, { token: adminToken, json: { isActive: 'no' } });
    check(notBoolean.status === 400 && !!notBoolean.body?.error?.details?.fields?.isActive, 'isActive must be true or false (400)');

    expectError(await api('PATCH', `/api/organizations/${northwind.id}/managers/${homeDev.id}/status`, { token: adminToken, json: { isActive: false } }), 404, 'NOT_FOUND', 'Admin cannot deactivate a developer through the manager route (404)');
    check((await db('users').where({ id: homeDev.id }).first()).is_active === true, 'The developer is still active');

    // ---- Members (Manager) ----
    console.log('\nMembers (Manager)');
    expectError(await api('GET', '/api/users', { token: adminToken }), 403, 'FORBIDDEN', 'System Admin cannot use the manager member list (403)');
    expectError(await api('GET', '/api/users', { token: developerToken }), 403, 'FORBIDDEN', 'A developer cannot list members (403)');
    expectError(await api('POST', '/api/users', { token: developerToken, json: { name: 'X', email: 'check-users-y@servicedesk.test', password: 'longenough123' } }), 403, 'FORBIDDEN', 'A developer cannot create users (403)');

    const members = await api('GET', '/api/users', { token: managerToken });
    const memberOrgs = new Set((members.body?.users ?? []).map((u: any) => u.organizationId));
    check(members.status === 200 && memberOrgs.size === 1 && memberOrgs.has(northwind.id), 'Manager sees ONLY members of their own organization');
    const contosoMembers = await api('GET', '/api/users', { token: otherManagerToken });
    check((contosoMembers.body?.users ?? []).every((u: any) => u.organizationId === contoso.id), 'A manager of another organization sees only their own members');

    const newDev = await api('POST', '/api/users', {
      token: managerToken,
      json: { name: 'Check Dev', email: 'check-users-dev@servicedesk.test', password: 'longenough123', role: 'manager', organizationId: contoso.id },
    });
    check(newDev.status === 201 && newDev.body?.user?.role === 'developer' && newDev.body?.user?.organizationId === northwind.id, 'Manager creates a DEVELOPER in their OWN organization; forged role / organizationId is ignored');
    const newDevId = newDev.body?.user?.id;
    expectError(await api('POST', '/api/users', { token: managerToken, json: { name: 'Dup', email: 'check-users-dev@servicedesk.test', password: 'longenough123' } }), 409, 'EMAIL_ALREADY_USED', 'Duplicate email is rejected (409)');
    const emptyCreate = await api('POST', '/api/users', { token: managerToken, json: {} });
    check(emptyCreate.status === 400 && !!emptyCreate.body?.error?.details?.fields?.name && !!emptyCreate.body?.error?.details?.fields?.email && !!emptyCreate.body?.error?.details?.fields?.password, 'Empty body returns 400 with details for every missing field');

    // Deactivate / activate a developer (Manager)
    const devBefore = await auditCount(newDevId);
    const devOff = await api('PATCH', `/api/users/${newDevId}/status`, { token: managerToken, json: { isActive: false } });
    check(devOff.status === 200 && devOff.body?.user?.isActive === false, 'Manager deactivates their own developer');
    check((await auditCount(newDevId)) === devBefore + 1, 'The deactivation was audited');
    const managerUser = await db('users').where({ email: 'nimal.manager@northwind.test' }).first();
    const devAudit = await db('audit_logs').where({ target_user_id: newDevId, action: 'USER_DEACTIVATED' }).first();
    check(devAudit?.actor_id === managerUser.id && devAudit?.organization_id === northwind.id, 'Audit entry names the manager as actor and the right organization');
    expectError(await api('POST', '/api/auth/login', { json: { email: 'check-users-dev@servicedesk.test', password: 'longenough123' } }), 403, 'ACCOUNT_INACTIVE', 'A deactivated developer cannot log in');
    const devOn = await api('PATCH', `/api/users/${newDevId}/status`, { token: managerToken, json: { isActive: true } });
    check(devOn.status === 200 && devOn.body?.user?.isActive === true, 'Manager reactivates the developer');

    // Isolation
    console.log('\nOrganization isolation');
    expectError(await api('PATCH', `/api/users/${crossDev.id}/status`, { token: managerToken, json: { isActive: false } }), 404, 'NOT_FOUND', "A manager cannot deactivate another organization's developer (404)");
    check((await db('users').where({ id: crossDev.id }).first()).is_active === true, "The other organization's developer is unchanged");
    expectError(await api('PATCH', `/api/users/${managerUser.id}/status`, { token: managerToken, json: { isActive: false } }), 403, 'FORBIDDEN', 'A manager cannot deactivate a manager, including themselves (403)');
    const ayesha = await db('users').where({ email: 'ayesha.manager@contoso.test' }).first();
    expectError(await api('PATCH', `/api/users/${ayesha.id}/status`, { token: managerToken, json: { isActive: false } }), 404, 'NOT_FOUND', "A manager cannot reach another organization's manager (404)");
    expectError(await api('PATCH', `/api/users/${adminUser.id}/status`, { token: managerToken, json: { isActive: false } }), 404, 'NOT_FOUND', 'A manager cannot reach the System Admin (404)');
    expectError(await api('PATCH', '/api/users/abc/status', { token: managerToken, json: { isActive: false } }), 400, 'VALIDATION_ERROR', 'A non-numeric user id returns 400');
    const noBody = await api('PATCH', `/api/users/${newDevId}/status`, { token: managerToken, json: {} });
    check(noBody.status === 400 && !!noBody.body?.error?.details?.fields?.isActive, 'Missing isActive returns 400 with details');

    // Transactional audit logging
    console.log('\nTransactional audit logging');
    // We hand the service a target with an organization that does not exist. The audit entry cannot be
    // saved (foreign key), so the deactivation itself must be rolled back as well.
    const realTarget = (await db('users').select(USER_COLUMNS).where({ id: newDevId }).first()) as UserRecord;
    const brokenTarget: UserRecord = { ...realTarget, organization_id: 999999 };
    let threw = false;
    try {
      await setUserActive({
        actor: { id: managerUser.id, name: managerUser.name, email: managerUser.email, role: 'manager', organizationId: managerUser.organization_id },
        target: brokenTarget,
        isActive: false,
      });
    } catch {
      threw = true;
    }
    const stillActive = (await db('users').where({ id: newDevId }).first()).is_active === true;
    check(threw && stillActive, 'If the audit entry cannot be saved, the user change is rolled back too');
  } finally {
    await cleanup();
    server.close();
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed.`);
  await db.destroy();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('\nThe check script crashed:', error.message);
  try {
    await cleanup();
  } catch {
    // ignore cleanup problems while reporting the real error
  }
  await db.destroy();
  process.exit(1);
});