import crypto from 'node:crypto';
import { Router } from 'express';
import { db } from '../db';
import { authenticate } from '../middleware/authenticate';
import { AppError } from '../utils/AppError';
import { signToken } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';
import {
  readBodyObject,
  readPassword,
  readRequiredString,
  throwIfIssues,
  type FieldIssues,
} from '../utils/validation';

export const authRouter = Router();

// A valid bcrypt hash of a password nobody knows. When the email does not exist we still check
// against it, so "unknown email" and "wrong password" take about the same time and look the same.
const DUMMY_HASH = '$2b$10$158UD4WvqGtFF7kgevpiFuNZp1.zCpyv3KIqBeUVA1wXiNNHMLEv6';

// POST /api/auth/login   body: { "email": "...", "password": "..." }
authRouter.post('/login', async (req, res) => {
  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};
  const email = readRequiredString(body, 'email', issues, { maxLength: 254 });
  const password = readRequiredString(body, 'password', issues, { maxLength: 128 });
  throwIfIssues(issues);

  const user = await db('users')
    .select('id', 'name', 'email', 'role', 'organization_id', 'is_active', 'must_change_password', 'password_hash')
    .whereRaw('lower(email) = ?', [email!.trim().toLowerCase()])
    .first();

  const passwordMatches = await verifyPassword(password!, user ? user.password_hash : DUMMY_HASH);
  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  if (!user.is_active) {
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated.');
  }

  res.json({
    token: signToken(user.id),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organization_id,
      mustChangePassword: Boolean(user.must_change_password),
    },
  });
});

// GET /api/auth/me   header: Authorization: Bearer <token>
authRouter.get('/me', authenticate, async (req, res) => {
  const user = req.user!;

  const dbUser = await db('users')
    .select('must_change_password')
    .where({ id: user.id })
    .first();

  let organization: { id: number; name: string } | null = null;
  if (user.organizationId !== null) {
    const row = await db('organizations').select('id', 'name').where({ id: user.organizationId }).first();
    organization = row ? { id: row.id, name: row.name } : null;
  }

  res.json({
    user: {
      ...user,
      mustChangePassword: Boolean(dbUser?.must_change_password),
      organization,
    },
  });
});

// POST /api/auth/change-password (Authenticated user changes their password)
// body: { "currentPassword": "...", "newPassword": "..." }
authRouter.post('/change-password', authenticate, async (req, res) => {
  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};
  const currentPassword = readRequiredString(body, 'currentPassword', issues, { maxLength: 128 });
  const newPassword = readPassword(body, 'newPassword', issues);
  throwIfIssues(issues);

  const user = await db('users')
    .select('id', 'password_hash')
    .where({ id: req.user!.id })
    .first();

  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found.');
  }

  const matches = await verifyPassword(currentPassword!, user.password_hash);
  if (!matches) {
    throw new AppError(400, 'INVALID_PASSWORD', 'Current password is incorrect.');
  }

  if (currentPassword === newPassword) {
    throw new AppError(400, 'SAME_PASSWORD', 'New password must be different from the current password.');
  }

  const newHash = await hashPassword(newPassword!);
  await db('users')
    .where({ id: req.user!.id })
    .update({
      password_hash: newHash,
      must_change_password: false,
    });

  res.json({ message: 'Password changed successfully.' });
});

// POST /api/auth/forgot-password (Public)
// body: { "email": "..." }
authRouter.post('/forgot-password', async (req, res) => {
  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};
  const email = readRequiredString(body, 'email', issues, { maxLength: 254 });
  throwIfIssues(issues);

  const genericResponse = {
    message: 'If an account with that email exists, password reset instructions have been sent.',
  };

  const user = await db('users')
    .select('id', 'is_active')
    .whereRaw('lower(email) = ?', [email!.trim().toLowerCase()])
    .first();

  // Do not disclose whether email exists (prevents user enumeration attack)
  if (!user || !user.is_active) {
    res.json(genericResponse);
    return;
  }

  // Generate a random 32-byte hex token and store its sha256 hash
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

  await db('password_reset_tokens').insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  // SIMULATE EMAIL: In production this sends an email via SMTP/SES/SendGrid.
  // Here, we log it to the secure server console only. The client NEVER receives the token!
  console.log('\n=================== [OUTGOING EMAIL SIMULATOR] ===================');
  console.log(`To: ${email.trim()}`);
  console.log('Subject: Password Reset Request');
  console.log(`Reset Link: http://localhost:5173/reset-password?token=${rawToken}`);
  console.log('==================================================================\n');

  // The client only ever receives the safe generic message (NO token exposed!)
  res.json(genericResponse);
});

// POST /api/auth/reset-password (Public)
// body: { "token": "...", "newPassword": "..." }
authRouter.post('/reset-password', async (req, res) => {
  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};
  const token = readRequiredString(body, 'token', issues, { maxLength: 256 });
  const newPassword = readPassword(body, 'newPassword', issues);
  throwIfIssues(issues);

  const tokenHash = crypto.createHash('sha256').update(token!.trim()).digest('hex');

  const record = await db('password_reset_tokens')
    .where({ token_hash: tokenHash })
    .whereNull('used_at')
    .andWhere('expires_at', '>', new Date())
    .first();

  if (!record) {
    throw new AppError(400, 'INVALID_TOKEN', 'Reset token is invalid or has expired.');
  }

  const newHash = await hashPassword(newPassword!);

  await db.transaction(async (trx) => {
    // Invalidate the token (single use)
    await trx('password_reset_tokens')
      .where({ id: record.id })
      .update({ used_at: trx.fn.now() });

    // Update user password and clear must_change_password
    await trx('users')
      .where({ id: record.user_id })
      .update({
        password_hash: newHash,
        must_change_password: false,
      });
  });

  res.json({ message: 'Password has been reset successfully. You can now log in.' });
});