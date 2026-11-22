import { Router } from 'express';
import { db } from '../db';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { USER_COLUMNS, createUser, setUserActive, toUserResponse, type UserRecord } from '../services/users';
import { AppError } from '../utils/AppError';
import { isUniqueViolation } from '../utils/dbErrors';
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

// Everything here is for the System Admin only.
export const organizationsRouter = Router();
organizationsRouter.use(authenticate, requireRole('system_admin'));

async function findOrganization(id: number): Promise<{ id: number; name: string; created_at: Date }> {
  const organization = await db('organizations').select('id', 'name', 'created_at').where({ id }).first();
  if (!organization) {
    throw new AppError(404, 'NOT_FOUND', 'Organization not found.');
  }
  return organization;
}

// GET /api/organizations  -> organization metadata: name, created date and member counts
organizationsRouter.get('/', async (_req, res) => {
  const rows = await db('organizations as o')
    .leftJoin('users as u', 'u.organization_id', 'o.id')
    .select('o.id', 'o.name', 'o.created_at')
    .select(db.raw("count(u.id) filter (where u.role = 'manager') as manager_count"))
    .select(db.raw("count(u.id) filter (where u.role = 'developer') as developer_count"))
    .groupBy('o.id')
    .orderBy([{ column: 'o.name' }, { column: 'o.id' }]);

  res.json({
    organizations: rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      managerCount: row.manager_count,
      developerCount: row.developer_count,
    })),
  });
});

// POST /api/organizations   body: { "name": "..." }
organizationsRouter.post('/', async (req, res) => {
  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};
  const name = readRequiredString(body, 'name', issues, { maxLength: 100 });
  throwIfIssues(issues);

  try {
    const [row] = await db('organizations').insert({ name: name!.trim() }).returning(['id', 'name', 'created_at']);
    res.status(201).json({ organization: { id: row.id, name: row.name, createdAt: row.created_at } });
  } catch (error) {
    if (isUniqueViolation(error, 'organizations_name_unique')) {
      throw new AppError(409, 'ORGANIZATION_NAME_USED', 'An organization with this name already exists.');
    }
    throw error;
  }
});

// GET /api/organizations/:orgId/managers
organizationsRouter.get('/:orgId/managers', async (req, res) => {
  const organization = await findOrganization(parseIdParam(req.params.orgId, 'orgId'));
  const rows = await db('users')
    .select(USER_COLUMNS)
    .where({ organization_id: organization.id, role: 'manager' })
    .orderBy([{ column: 'name' }, { column: 'id' }]);
  res.json({ managers: (rows as UserRecord[]).map(toUserResponse) });
});

// POST /api/organizations/:orgId/managers   body: { "name", "email", "password" }
// The role is always "manager". Any "role" or "organizationId" in the body is ignored.
organizationsRouter.post('/:orgId/managers', async (req, res) => {
  const organization = await findOrganization(parseIdParam(req.params.orgId, 'orgId'));

  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};
  const name = readRequiredString(body, 'name', issues, { maxLength: 100 });
  const email = readEmail(body, 'email', issues);
  const password = readPassword(body, 'password', issues);
  throwIfIssues(issues);

  const user = await createUser({
    organizationId: organization.id,
    role: 'manager',
    name: name!,
    email: email!,
    password: password!,
  });
  res.status(201).json({ user: toUserResponse(user) });
});

// PATCH /api/organizations/:orgId/managers/:userId/status   body: { "isActive": true | false }
organizationsRouter.patch('/:orgId/managers/:userId/status', async (req, res) => {
  const organization = await findOrganization(parseIdParam(req.params.orgId, 'orgId'));
  const userId = parseIdParam(req.params.userId, 'userId');

  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};
  const isActive = readBoolean(body, 'isActive', issues);
  throwIfIssues(issues);

  // Only a MANAGER of THIS organization can be found here.
  const target = (await db('users')
    .select(USER_COLUMNS)
    .where({ id: userId, organization_id: organization.id, role: 'manager' })
    .first()) as UserRecord | undefined;
  if (!target) {
    throw new AppError(404, 'NOT_FOUND', 'Manager not found in this organization.');
  }

  const result = await setUserActive({ actor: req.user!, target, isActive: isActive! });
  res.json({ user: toUserResponse(result.user), changed: result.changed });
});