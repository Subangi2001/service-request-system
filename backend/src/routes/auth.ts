import { Router } from 'express';
import { db } from '../db';
import { authenticate } from '../middleware/authenticate';
import { AppError } from '../utils/AppError';
import { signToken } from '../utils/jwt';
import { verifyPassword } from '../utils/password';
import { readBodyObject, readRequiredString, throwIfIssues, type FieldIssues } from '../utils/validation';

export const authRouter = Router();

// A valid bcrypt hash of a password nobody knows. When the email does not exist we still check
// against it, so "unknown email" and "wrong password" take about the same time and look the same.
const DUMMY_HASH = '$2b$10$158UD4WvqGtFF7kgevpiFuNZp1.zCpyv3KIqBeUVA1wXiNNHMLEv6';

// POST /api/auth/login   body: { "email": "...", "password": "..." }
// Any other field in the body (for example "role" or "organizationId") is ignored.
authRouter.post('/login', async (req, res) => {
  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};
  const email = readRequiredString(body, 'email', issues, { maxLength: 254 });
  const password = readRequiredString(body, 'password', issues, { maxLength: 128 });
  throwIfIssues(issues);

  const user = await db('users')
    .select('id', 'name', 'email', 'role', 'organization_id', 'is_active', 'password_hash')
    .whereRaw('lower(email) = ?', [email!.trim().toLowerCase()])
    .first();

  const passwordMatches = await verifyPassword(password!, user ? user.password_hash : DUMMY_HASH);
  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  // Only reached with the correct password, so this message does not help a stranger guess accounts.
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
    },
  });
});

// GET /api/auth/me   header: Authorization: Bearer <token>
// Returns the logged-in user and the name of their organization.
authRouter.get('/me', authenticate, async (req, res) => {
  const user = req.user!;

  let organization: { id: number; name: string } | null = null;
  if (user.organizationId !== null) {
    const row = await db('organizations').select('id', 'name').where({ id: user.organizationId }).first();
    organization = row ? { id: row.id, name: row.name } : null;
  }

  res.json({ user: { ...user, organization } });
});