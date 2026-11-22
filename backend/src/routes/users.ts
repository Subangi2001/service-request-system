import { Router } from 'express';
import { db } from '../db';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { USER_COLUMNS, createUser, setUserActive, toUserResponse, type UserRecord } from '../services/users';
import { AppError } from '../utils/AppError';
import { organizationIdOf } from '../utils/tenant';
import {
  parseIdParam,
  readBodyObject,
  readBoolean,
  readEmail,
  readPassword,
  readRequiredString,
  throwIfIssues,
  type FieldIssues,
} from '../utils/validation';

// Everything here is for Organization Managers only, and only about THEIR OWN organization.
export const usersRouter = Router();
usersRouter.use(authenticate, requireRole('manager'));

// GET /api/users  -> the members (managers and developers) of the manager's own organization
usersRouter.get('/', async (req, res) => {
  const organizationId = organizationIdOf(req.user!);
  const rows = await db('users')
    .select(USER_COLUMNS)
    .where({ organization_id: organizationId })
    .orderBy([{ column: 'role' }, { column: 'name' }, { column: 'id' }]);
  res.json({ users: (rows as UserRecord[]).map(toUserResponse) });
});

// POST /api/users   body: { "name", "email", "password" }
// Creates a DEVELOPER in the manager's own organization.
// Any "role" or "organizationId" in the body is ignored.
usersRouter.post('/', async (req, res) => {
  const organizationId = organizationIdOf(req.user!);

  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};
  const name = readRequiredString(body, 'name', issues, { maxLength: 100 });
  const email = readEmail(body, 'email', issues);
  const password = readPassword(body, 'password', issues);
  throwIfIssues(issues);

  const user = await createUser({ organizationId, role: 'developer', name: name!, email: email!, password: password! });
  res.status(201).json({ user: toUserResponse(user) });
});

// PATCH /api/users/:userId/status   body: { "isActive": true | false }
// A manager can activate or deactivate DEVELOPERS of their own organization.
usersRouter.patch('/:userId/status', async (req, res) => {
  const organizationId = organizationIdOf(req.user!);
  const userId = parseIdParam(req.params.userId, 'userId');

  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};
  const isActive = readBoolean(body, 'isActive', issues);
  throwIfIssues(issues);

  // The organization filter means a user of another organization simply "does not exist" here.
  const target = (await db('users')
    .select(USER_COLUMNS)
    .where({ id: userId, organization_id: organizationId })
    .first()) as UserRecord | undefined;
  if (!target) {
    throw new AppError(404, 'NOT_FOUND', 'User not found.');
  }

  if (target.role !== 'developer') {
    throw new AppError(403, 'FORBIDDEN', 'Managers can only activate or deactivate developers.');
  }

  const result = await setUserActive({ actor: req.user!, target, isActive: isActive! });
  res.json({ user: toUserResponse(result.user), changed: result.changed });
});