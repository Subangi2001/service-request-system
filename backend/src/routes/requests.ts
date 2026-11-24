import { Router } from 'express';
import { db } from '../db';
import { CATEGORIES, PRIORITIES, STATUSES } from '../domain/requestConstants';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import {
  assignRequest,
  createRequest,
  getRequestForUser,
  listRequests,
  reassignRequest,
  transitionRequestStatus,
  updateRequest,
  type ListFilters,
  type RequestChanges,
} from '../services/requests';
import { organizationIdOf } from '../utils/tenant';
import {
  parseIdParam,
  readBodyObject,
  readDateTime,
  readEnum,
  readPositiveInt,
  readRequiredString,
  throwIfIssues,
  validationError,
  type FieldIssues,
} from '../utils/validation';

export const requestsRouter = Router();
requestsRouter.use(authenticate);

const SORT_FIELDS = ['createdAt', 'updatedAt', 'deadline', 'priority', 'status'] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;
const EDITABLE_FIELDS = ['title', 'description', 'priority', 'category', 'deadline'];

// GET /api/requests
// Managers see all requests of their organization. Developers see only the requests assigned to them.
// Query: status, priority, assigneeId, createdFrom, createdTo, deadlineFrom, deadlineTo,
//        sortBy (createdAt | updatedAt | deadline | priority | status), sortOrder (asc | desc), page, limit
requestsRouter.get('/', requireRole('manager', 'developer'), async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const issues: FieldIssues = {};

  // Support single status or comma-separated list of statuses (e.g. status=Submitted,Under Review)
  let parsedStatus: typeof STATUSES[number] | typeof STATUSES[number][] | undefined = undefined;
  if (typeof query.status === 'string' && query.status.trim() !== '') {
    const parts = query.status.split(',').map((s) => s.trim());
    const validParts: typeof STATUSES[number][] = [];
    for (const part of parts) {
      if ((STATUSES as readonly string[]).includes(part)) {
        validParts.push(part as typeof STATUSES[number]);
      } else {
        issues.status = `status must be one of: ${STATUSES.join(', ')}.`;
      }
    }
    if (validParts.length === 1) {
      parsedStatus = validParts[0];
    } else if (validParts.length > 1) {
      parsedStatus = validParts;
    }
  }

  // Parse isOverdue flag
  let isOverdue: boolean | undefined = undefined;
  if (query.isOverdue === 'true') isOverdue = true;
  else if (query.isOverdue === 'false') isOverdue = false;

  const filters: ListFilters = {
    status: parsedStatus,
    isOverdue,
    priority: readEnum(query, 'priority', issues, PRIORITIES, false),
    assigneeId: readPositiveInt(query, 'assigneeId', issues, { required: false }),
    createdFrom: readDateTime(query, 'createdFrom', issues, false),
    createdTo: readDateTime(query, 'createdTo', issues, false),
    deadlineFrom: readDateTime(query, 'deadlineFrom', issues, false),
    deadlineTo: readDateTime(query, 'deadlineTo', issues, false),
    sortBy: readEnum(query, 'sortBy', issues, SORT_FIELDS, false) ?? 'createdAt',
    sortOrder: readEnum(query, 'sortOrder', issues, SORT_ORDERS, false) ?? 'desc',
    page: readPositiveInt(query, 'page', issues, { required: false }) ?? 1,
    limit: readPositiveInt(query, 'limit', issues, { required: false, max: 100 }) ?? 20,
  };
  throwIfIssues(issues);

  res.json(await listRequests(req.user!, filters));
});

// POST /api/requests   (managers only)
// body: { title, description, priority, category, deadline }
// The organization, creator, status and reference number are set by the server. Anything else in the body is ignored.
requestsRouter.post('/', requireRole('manager'), async (req, res) => {
  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};
  const title = readRequiredString(body, 'title', issues, { maxLength: 200 });
  const description = readRequiredString(body, 'description', issues, { maxLength: 5000 });
  const priority = readEnum(body, 'priority', issues, PRIORITIES);
  const category = readEnum(body, 'category', issues, CATEGORIES);
  const deadline = readDateTime(body, 'deadline', issues);
  throwIfIssues(issues);

  const request = await createRequest(req.user!, {
    title: title!,
    description: description!,
    priority: priority!,
    category: category!,
    deadline: deadline!,
  });
  res.status(201).json({ request });
});

// GET /api/requests/:id
requestsRouter.get('/:id', requireRole('manager', 'developer'), async (req, res) => {
  const id = parseIdParam(req.params.id, 'id');
  res.json({ request: await getRequestForUser(req.user!, id) });
});

// GET /api/requests/:id/audit   (managers only)
// Returns audit log history for a specific request in the manager's organization.
requestsRouter.get('/:id/audit', requireRole('manager'), async (req, res) => {
  const id = parseIdParam(req.params.id, 'id');
  // First ensure the request exists in the manager's organization
  await getRequestForUser(req.user!, id);

  const logs = await db('audit_logs as a')
    .join('users as u', 'u.id', 'a.actor_id')
    .select(
      'a.id',
      'a.action',
      'a.old_value',
      'a.new_value',
      'a.reason',
      'a.created_at',
      'a.actor_id',
      'u.name as actor_name',
      'u.role as actor_role'
    )
    .where({ 'a.request_id': id, 'a.organization_id': organizationIdOf(req.user!) })
    .orderBy('a.id', 'asc');

  res.json({
    auditLogs: logs.map((log) => ({
      id: log.id,
      action: log.action,
      oldValue: log.old_value,
      newValue: log.new_value,
      reason: log.reason,
      createdAt: log.created_at,
      actor: { id: log.actor_id, name: log.actor_name, role: log.actor_role },
    })),
  });
});

// PATCH /api/requests/:id   (managers only, and not once the request is Completed)
// body: { version, and any of: title, description, priority, category, deadline }
// "version" is the version the client last saw. Status, assignee, organization and reference number cannot be edited here.
requestsRouter.patch('/:id', requireRole('manager'), async (req, res) => {
  const id = parseIdParam(req.params.id, 'id');
  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};

  const version = readPositiveInt(body, 'version', issues);
  const changes: RequestChanges = {};
  if ('title' in body) changes.title = readRequiredString(body, 'title', issues, { maxLength: 200 });
  if ('description' in body) changes.description = readRequiredString(body, 'description', issues, { maxLength: 5000 });
  if ('priority' in body) changes.priority = readEnum(body, 'priority', issues, PRIORITIES);
  if ('category' in body) changes.category = readEnum(body, 'category', issues, CATEGORIES);
  if ('deadline' in body) changes.deadline = readDateTime(body, 'deadline', issues);
  throwIfIssues(issues);

  if (!EDITABLE_FIELDS.some((field) => field in body)) {
    throw validationError({ body: `Provide at least one field to change: ${EDITABLE_FIELDS.join(', ')}.` });
  }

  res.json({ request: await updateRequest(req.user!, id, version!, changes) });
});

// POST /api/requests/:id/assign   body: { "assigneeId": 12, "version": 1 }
// Managers only. Initial assignment from "Under Review" to "Assigned".
requestsRouter.post('/:id/assign', requireRole('manager'), async (req, res) => {
  const id = parseIdParam(req.params.id, 'id');
  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};

  const assigneeId = readPositiveInt(body, 'assigneeId', issues, { required: true });
  const version = readPositiveInt(body, 'version', issues, { required: true });
  throwIfIssues(issues);

  const request = await assignRequest(req.user!, id, version!, assigneeId!);
  res.json({ request });
});

// POST /api/requests/:id/reassign   body: { "assigneeId": 14, "reason": "...", "version": 2 }
// Managers only. Reassignment while Assigned, In Progress, or Reopened.
requestsRouter.post('/:id/reassign', requireRole('manager'), async (req, res) => {
  const id = parseIdParam(req.params.id, 'id');
  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};

  const assigneeId = readPositiveInt(body, 'assigneeId', issues, { required: true });
  const reason = readRequiredString(body, 'reason', issues, { maxLength: 500 });
  const version = readPositiveInt(body, 'version', issues, { required: true });
  throwIfIssues(issues);

  const request = await reassignRequest(req.user!, id, version!, assigneeId!, reason!);
  res.json({ request });
});

// POST /api/requests/:id/status   body: { "status": "In Progress", "version": 2, "reason"?: "..." }
// Managers and developers. Reopening requires a reason.
requestsRouter.post('/:id/status', requireRole('manager', 'developer'), async (req, res) => {
  const id = parseIdParam(req.params.id, 'id');
  const body = readBodyObject(req.body);
  const issues: FieldIssues = {};

  const status = readEnum(body, 'status', issues, STATUSES, true);
  const version = readPositiveInt(body, 'version', issues, { required: true });
  throwIfIssues(issues);

  const reason = typeof body.reason === 'string' ? body.reason.trim() : undefined;

  const request = await transitionRequestStatus(req.user!, id, version!, status!, reason);
  res.json({ request });
});