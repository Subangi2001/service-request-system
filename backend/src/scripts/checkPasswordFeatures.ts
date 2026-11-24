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

async function main(): Promise<void> {
  const password = process.env.SEED_PASSWORD?.trim() || 'Subangi27';

  const server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    console.log('Testing Password Security Features...');

    // 1. Manager logs in
    const mgrLogin = await api('POST', '/api/auth/login', {
      json: { email: 'nimal.manager@northwind.test', password },
    });
    check(mgrLogin.status === 200, 'Manager logs in');
    const mgrToken = mgrLogin.body.token;

    // 2. Manager creates a new developer
    const testDevEmail = `temp.dev.${Date.now()}@northwind.test`;
    const createDev = await api('POST', '/api/users', {
      token: mgrToken,
      json: {
        name: 'Auto Test Dev',
        email: testDevEmail,
        password: 'InitialPassword123!',
      },
    });
    check(createDev.status === 201, 'Manager creates new developer');
    check(
      createDev.body.user.mustChangePassword === true,
      'Newly created developer has mustChangePassword = true'
    );

    // 3. New developer logs in for the first time
    const devLogin = await api('POST', '/api/auth/login', {
      json: { email: testDevEmail, password: 'InitialPassword123!' },
    });
    check(devLogin.status === 200, 'New developer can log in with initial password');
    check(
      devLogin.body.user.mustChangePassword === true,
      'Login response indicates mustChangePassword is required'
    );
    const devToken = devLogin.body.token;

    // 4. Change password with wrong current password should fail (400)
    const wrongCurrent = await api('POST', '/api/auth/change-password', {
      token: devToken,
      json: { currentPassword: 'WrongPassword!', newPassword: 'UpdatedPassword123!' },
    });
    check(wrongCurrent.status === 400, 'Password change rejected if current password incorrect');

    // 5. Change password successfully
    const successChange = await api('POST', '/api/auth/change-password', {
      token: devToken,
      json: { currentPassword: 'InitialPassword123!', newPassword: 'UpdatedPassword123!' },
    });
    check(successChange.status === 200, 'Password changed successfully');

    // 6. Verify mustChangePassword is now false on /api/auth/me
    const meRes = await api('GET', '/api/auth/me', { token: devToken });
    check(meRes.body.user.mustChangePassword === false, 'mustChangePassword cleared after update');

    // 7. Verify old password cannot log in anymore (401)
    const oldLogin = await api('POST', '/api/auth/login', {
      json: { email: testDevEmail, password: 'InitialPassword123!' },
    });
    check(oldLogin.status === 401, 'Old password is no longer valid');

    // 8. Verify new password logs in successfully
    const newLogin = await api('POST', '/api/auth/login', {
      json: { email: testDevEmail, password: 'UpdatedPassword123!' },
    });
    check(newLogin.status === 200, 'New password logs in successfully');

    // 9. Forgot password request (non-existent email returns safe generic response)
    const nonExistent = await api('POST', '/api/auth/forgot-password', {
      json: { email: 'nobody@nowhere.test' },
    });
    check(
      nonExistent.status === 200 && nonExistent.body.message.includes('password reset'),
      'Forgot password does not reveal whether email exists'
    );

    // 10. Forgot password for real user generates valid token
    const forgotRes = await api('POST', '/api/auth/forgot-password', {
      json: { email: testDevEmail },
    });
    check(forgotRes.status === 200, 'Forgot password succeeds for registered user');

    // Read the generated token from the database directly (simulating receiving the email link)
    const tokenRecord = await db('password_reset_tokens')
      .where({ user_id: createDev.body.user.id })
      .whereNull('used_at')
      .first();
    check(!!tokenRecord, 'Reset token record is stored in database');

    // Clean up temporary user
    await db('password_reset_tokens').where({ user_id: createDev.body.user.id }).del();
    await db('users').where({ id: createDev.body.user.id }).del();
  } finally {
    server.close();
  }

  console.log(`\nPassword Feature Results: ${passed} passed, ${failed} failed.`);
  await db.destroy();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await db.destroy();
  process.exit(1);
});