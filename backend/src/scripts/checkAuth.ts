import type { AddressInfo } from 'node:net';
import express from 'express';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { env } from '../config/env';
import { db } from '../db';
import { authenticate } from '../middleware/authenticate';
import { errorHandler } from '../middleware/errorHandler';
import { requireRole } from '../middleware/requireRole';
import { hashPassword } from '../utils/password';

// Checks login, tokens and role protection against a real running copy of the API.
// It creates two temporary users and deletes them again at the end.
// Run it with: npm run check:auth

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

async function call(
  base: string,
  method: string,
  path: string,
  options: { token?: string; json?: unknown; rawBody?: string } = {}
): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.json !== undefined || options.rawBody !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: options.rawBody ?? (options.json !== undefined ? JSON.stringify(options.json) : undefined),
  });
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

const api = (method: string, path: string, options: { token?: string; json?: unknown; rawBody?: string } = {}) =>
  call(baseUrl, method, path, options);

function expectError(reply: Reply, status: number, code: string, label: string): void {
  check(reply.status === status && reply.body?.error?.code === code, label, `got ${reply.status} ${reply.body?.error?.code}`);
}

async function login(email: string, password: string): Promise<Reply> {
  return api('POST', '/api/auth/login', { json: { email, password } });
}

async function main(): Promise<void> {
  const password = process.env.SEED_PASSWORD?.trim();
  if (!password) {
    throw new Error('SEED_PASSWORD is missing in backend/.env (the demo accounts must exist: run npm run db:seed).');
  }

  // Start the real app on a free port.
  const server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // A second, tiny app that uses the role protection, because no real route needs it yet.
  const roleApp = express();
  roleApp.get('/manager-only', authenticate, requireRole('manager'), (_req, res) => {
    res.json({ ok: true });
  });
  roleApp.use(errorHandler);
  const roleServer = roleApp.listen(0);
  const roleUrl = `http://127.0.0.1:${(roleServer.address() as AddressInfo).port}`;

  const manager = await db('users').where({ email: 'nimal.manager@northwind.test' }).first();
  if (!manager) {
    throw new Error('Demo users not found. Run: npm run db:seed');
  }

  // Temporary users (removed at the end).
  const tempEmails = ['check-auth-inactive@servicedesk.test', 'check-auth-deactivated@servicedesk.test'];
  await db('users').whereIn('email', tempEmails).del();
  const passwordHash = await hashPassword(password);
  const [inactiveUser] = await db('users')
    .insert({ organization_id: manager.organization_id, name: 'Temp Inactive', email: tempEmails[0], password_hash: passwordHash, role: 'developer', is_active: false })
    .returning('id');
  const [soonDeactivated] = await db('users')
    .insert({ organization_id: manager.organization_id, name: 'Temp Deactivated', email: tempEmails[1], password_hash: passwordHash, role: 'developer', is_active: true })
    .returning('id');

  try {
    console.log('Checking login and role protection...');

    // ---- Login ----
    console.log('\nLogin');
    const good = await login('nimal.manager@northwind.test', password);
    check(good.status === 200 && typeof good.body?.token === 'string', 'Correct email and password returns a token');
    check(good.body?.user?.role === 'manager' && typeof good.body?.user?.organizationId === 'number', 'Response contains the user, role and organization');
    check(!JSON.stringify(good.body).includes('password'), 'Response never contains a password or hash');

    expectError(await login('nimal.manager@northwind.test', 'wrong-password'), 401, 'INVALID_CREDENTIALS', 'Wrong password is rejected (401)');
    const unknown = await login('nobody@servicedesk.test', 'whatever123');
    expectError(unknown, 401, 'INVALID_CREDENTIALS', 'Unknown email gets the same error as a wrong password');
    check((await login('NIMAL.Manager@Northwind.test', password)).status === 200, 'Email letter case does not matter');
    expectError(await login(tempEmails[0], password), 403, 'ACCOUNT_INACTIVE', 'Inactive user cannot log in (403)');

    const emptyBody = await api('POST', '/api/auth/login', { json: {} });
    check(emptyBody.status === 400 && emptyBody.body?.error?.code === 'VALIDATION_ERROR' && !!emptyBody.body?.error?.details?.fields?.email && !!emptyBody.body?.error?.details?.fields?.password, 'Empty body returns 400 with details for email and password');
    const noPassword = await api('POST', '/api/auth/login', { json: { email: 'a@b.test' } });
    check(noPassword.status === 400 && !!noPassword.body?.error?.details?.fields?.password, 'Missing password returns 400 with details');
    const wrongType = await api('POST', '/api/auth/login', { json: { email: 123, password: ['x'] } });
    check(wrongType.status === 400, 'Wrong data types return 400');
    expectError(await api('POST', '/api/auth/login', { rawBody: '{bad json' }), 400, 'INVALID_JSON', 'Malformed JSON returns 400');

    const forged = await api('POST', '/api/auth/login', { json: { email: 'kamal.dev@northwind.test', password, role: 'system_admin', organizationId: 999 } });
    check(forged.status === 200 && forged.body?.user?.role === 'developer' && forged.body?.user?.organizationId === manager.organization_id, 'A forged role / organizationId in the body is ignored');

    // ---- /me and tokens ----
    console.log('\nTokens');
    expectError(await api('GET', '/api/auth/me'), 401, 'UNAUTHENTICATED', 'No token is rejected (401)');
    expectError(await api('GET', '/api/auth/me', { token: 'not-a-real-token' }), 401, 'INVALID_TOKEN', 'Garbage token is rejected (401)');

    const me = await api('GET', '/api/auth/me', { token: good.body.token });
    check(me.status === 200 && me.body?.user?.email === 'nimal.manager@northwind.test' && me.body?.user?.organization?.name === 'Northwind Traders', 'Valid token returns the user and organization name');

    const adminLogin = await login('admin@servicedesk.test', password);
    const adminMe = await api('GET', '/api/auth/me', { token: adminLogin.body?.token });
    check(adminMe.status === 200 && adminMe.body?.user?.role === 'system_admin' && adminMe.body?.user?.organization === null, 'System Admin has no organization');

    const expired = jwt.sign({}, env.jwt.secret, { subject: String(manager.id), expiresIn: -10 });
    expectError(await api('GET', '/api/auth/me', { token: expired }), 401, 'TOKEN_EXPIRED', 'Expired token is rejected (401)');
    const forgedSignature = jwt.sign({}, 'some-other-secret-that-is-not-ours-123456', { subject: String(manager.id), expiresIn: '1h' });
    expectError(await api('GET', '/api/auth/me', { token: forgedSignature }), 401, 'INVALID_TOKEN', 'Token signed with a different secret is rejected');
    const ghost = jwt.sign({}, env.jwt.secret, { subject: '999999999', expiresIn: '1h' });
    expectError(await api('GET', '/api/auth/me', { token: ghost }), 401, 'INVALID_TOKEN', 'Token of a user that does not exist is rejected');
    const roleClaim = jwt.sign({ role: 'system_admin' }, env.jwt.secret, { subject: String(manager.id), expiresIn: '1h' });
    const roleClaimMe = await api('GET', '/api/auth/me', { token: roleClaim });
    check(roleClaimMe.body?.user?.role === 'manager', 'A "role" written inside a token is ignored (role comes from the database)');

    const tempLogin = await login(tempEmails[1], password);
    check(tempLogin.status === 200, 'Active temporary user can log in');
    await db('users').where({ id: soonDeactivated.id }).update({ is_active: false });
    expectError(await api('GET', '/api/auth/me', { token: tempLogin.body?.token }), 403, 'ACCOUNT_INACTIVE', 'A user deactivated AFTER login is locked out immediately');

    // ---- Role protection ----
    console.log('\nRole protection (requireRole)');
    const managerToken = good.body.token;
    const developerToken = forged.body.token;
    const adminToken = adminLogin.body.token;
    const asManager = await call(roleUrl, 'GET', '/manager-only', { token: managerToken });
    check(asManager.status === 200, 'Manager may use a manager-only route');
    expectError(await call(roleUrl, 'GET', '/manager-only', { token: developerToken }), 403, 'FORBIDDEN', 'Developer is refused (403)');
    expectError(await call(roleUrl, 'GET', '/manager-only', { token: adminToken }), 403, 'FORBIDDEN', 'System Admin is refused on a manager-only route (403)');
    expectError(await call(roleUrl, 'GET', '/manager-only'), 401, 'UNAUTHENTICATED', 'No token is refused (401)');
  } finally {
    await db('users').whereIn('email', tempEmails).del();
    server.close();
    roleServer.close();
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed.`);
  await db.destroy();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('\nThe check script crashed:', error.message);
  await db.destroy();
  process.exit(1);
});