import type { Knex } from 'knex';
import { db } from '../db';
import type { Category, Priority, RequestStatus } from '../domain/requestConstants';
import type { AuthUser } from '../middleware/authenticate';
import { AppError } from '../utils/AppError';
import { organizationIdOf } from '../utils/tenant';
import { writeAudit } from './audit';

// A request row joined with the names of its creator and assignee.
type RequestRow = {
  id: number;
  reference_number: string;
  title: string;
  description: string;
  priority: Priority;
  category: Category;
  status: RequestStatus;
  organization_id: number;
  created_by: number;
  created_by_name: string;
  assignee_id: number | null;
  assignee_name: string | null;
  deadline: Date;
  completed_at: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  is_overdue: boolean;
};

// The shape sent to the client.
export function toRequestResponse(row: RequestRow) {
  return {
    id: row.id,
    referenceNumber: row.reference_number,
    title: row.title,
    description: row.description,
    priority: row.priority,
    category: row.category,
    status: row.status,
    organizationId: row.organization_id,
    createdBy: { id: row.created_by, name: row.created_by_name },
    assignee: row.assignee_id === null ? null : { id: row.assignee_id, name: row.assignee_name },
    deadline: row.deadline,
    completedAt: row.completed_at,
    isOverdue: row.is_overdue,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// The query that reads requests together with the creator's and assignee's names.
// "Overdue" is calculated here (never stored): the deadline has passed and the request is not Completed.
function baseQuery(): Knex.QueryBuilder {
  return db('service_requests as r')
    .join('users as c', 'c.id', 'r.created_by')
    .leftJoin('users as a', 'a.id', 'r.assignee_id')
    .select(
      'r.id',
      'r.reference_number',
      'r.title',
      'r.description',
      'r.priority',
      'r.category',
      'r.status',
      'r.organization_id',
      'r.created_by',
      'c.name as created_by_name',
      'r.assignee_id',
      'a.name as assignee_name',
      'r.deadline',
      'r.completed_at',
      'r.version',
      'r.created_at',
      'r.updated_at'
    )
    .select(db.raw("(r.deadline < now() AND r.status <> 'Completed') as is_overdue"));
}

// THE tenant-isolation rule for reading requests. Every read goes through this function:
// - the request must belong to the user's own organization (taken from the logged-in user),
// - a developer additionally sees only the requests assigned to them.
function scopeToUser(query: Knex.QueryBuilder, user: AuthUser): Knex.QueryBuilder {
  query.where('r.organization_id', organizationIdOf(user));
  if (user.role === 'developer') {
    query.where('r.assignee_id', user.id);
  }
  return query;
}

export type ListFilters = {
  status?: RequestStatus | RequestStatus[];
  isOverdue?: boolean;
  priority?: Priority;
  assigneeId?: number;
  createdFrom?: Date;
  createdTo?: Date;
  deadlineFrom?: Date;
  deadlineTo?: Date;
  sortBy: 'createdAt' | 'updatedAt' | 'deadline' | 'priority' | 'status';
  sortOrder: 'asc' | 'desc';
  page: number;
  limit: number;
};

function applyFilters(query: Knex.QueryBuilder, filters: ListFilters): Knex.QueryBuilder {
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      query.whereIn('r.status', filters.status);
    } else {
      query.where('r.status', filters.status);
    }
  }
  if (filters.isOverdue !== undefined) {
    if (filters.isOverdue) {
      query.whereRaw("r.deadline < now() AND r.status <> 'Completed'");
    } else {
      query.whereRaw("(r.deadline >= now() OR r.status = 'Completed')");
    }
  }
  if (filters.priority) query.where('r.priority', filters.priority);
  if (filters.assigneeId) query.where('r.assignee_id', filters.assigneeId);
  if (filters.createdFrom) query.where('r.created_at', '>=', filters.createdFrom);
  if (filters.createdTo) query.where('r.created_at', '<=', filters.createdTo);
  if (filters.deadlineFrom) query.where('r.deadline', '>=', filters.deadlineFrom);
  if (filters.deadlineTo) query.where('r.deadline', '<=', filters.deadlineTo);
  return query;
}

// Only these fixed SQL pieces can ever be used for sorting (nothing typed by the client is put into SQL).
// Priority and status are sorted by their meaning (Low < Medium < High < Critical), not alphabetically.
const SORT_EXPRESSIONS: Record<ListFilters['sortBy'], string> = {
  createdAt: 'r.created_at',
  updatedAt: 'r.updated_at',
  deadline: 'r.deadline',
  priority: "CASE r.priority WHEN 'Low' THEN 1 WHEN 'Medium' THEN 2 WHEN 'High' THEN 3 WHEN 'Critical' THEN 4 END",
  status:
    "CASE r.status WHEN 'Submitted' THEN 1 WHEN 'Under Review' THEN 2 WHEN 'Assigned' THEN 3 WHEN 'In Progress' THEN 4 WHEN 'Completed' THEN 5 WHEN 'Reopened' THEN 6 END",
};

export async function listRequests(user: AuthUser, filters: ListFilters) {
  const totalRow = await applyFilters(scopeToUser(db('service_requests as r'), user), filters)
    .count({ total: '*' })
    .first();
  const total = Number(totalRow?.total ?? 0);

  // The id is always added as the last sort key, so two rows never swap places between pages.
  const direction = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const rows = await applyFilters(scopeToUser(baseQuery(), user), filters)
    .orderByRaw(`${SORT_EXPRESSIONS[filters.sortBy]} ${direction}, r.id ${direction}`)
    .limit(filters.limit)
    .offset((filters.page - 1) * filters.limit);

  return {
    requests: (rows as RequestRow[]).map(toRequestResponse),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
  };
}

// Read one request. If it is in another organization (or, for a developer, not assigned to them),
// it simply does not exist for this user: 404, and nothing is revealed.
export async function getRequestForUser(user: AuthUser, id: number) {
  const row = (await scopeToUser(baseQuery(), user).where('r.id', id).first()) as RequestRow | undefined;
  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'Request not found.');
  }
  return toRequestResponse(row);
}

export async function createRequest(
  actor: AuthUser,
  input: { title: string; description: string; priority: Priority; category: Category; deadline: Date }
) {
  const organizationId = organizationIdOf(actor);

  // The request and its audit entry are saved together, or not at all.
  const id = await db.transaction(async (trx) => {
    const [row] = await trx('service_requests')
      .insert({
        title: input.title.trim(),
        description: input.description.trim(),
        priority: input.priority,
        category: input.category,
        organization_id: organizationId,
        created_by: actor.id,
        deadline: input.deadline,
      })
      .returning(['id', 'reference_number', 'title', 'priority', 'category', 'status', 'deadline']);

    await writeAudit(trx, {
      organizationId,
      requestId: row.id,
      actorId: actor.id,
      action: 'REQUEST_CREATED',
      newValue: {
        reference_number: row.reference_number,
        title: row.title,
        priority: row.priority,
        category: row.category,
        status: row.status,
        deadline: row.deadline,
        assignee_id: null,
      },
    });
    return row.id as number;
  });

  return getRequestForUser(actor, id);
}

export type RequestChanges = {
  title?: string;
  description?: string;
  priority?: Priority;
  category?: Category;
  deadline?: Date;
};

// Edit a request. The client must send the version it last saw (optimistic concurrency):
// if somebody else changed the request in the meantime, nothing is overwritten and the answer is 409.
export async function updateRequest(actor: AuthUser, id: number, version: number, changes: RequestChanges) {
  const organizationId = organizationIdOf(actor);

  const values: Record<string, unknown> = {};
  if (changes.title !== undefined) values.title = changes.title.trim();
  if (changes.description !== undefined) values.description = changes.description.trim();
  if (changes.priority !== undefined) values.priority = changes.priority;
  if (changes.category !== undefined) values.category = changes.category;
  if (changes.deadline !== undefined) values.deadline = changes.deadline;

  // One atomic statement: it only changes the row if the organization, the version and the status all match.
  const updatedCount = await db('service_requests')
    .where({ id, organization_id: organizationId, version })
    .whereNot('status', 'Completed')
    .update({ ...values, version: db.raw('version + 1'), updated_at: db.fn.now() });

  if (updatedCount === 0) {
    // Find out why, to give a useful answer.
    const current = await db('service_requests')
      .select('status', 'version')
      .where({ id, organization_id: organizationId })
      .first();
    if (!current) {
      throw new AppError(404, 'NOT_FOUND', 'Request not found.');
    }
    if (current.status === 'Completed') {
      throw new AppError(409, 'REQUEST_COMPLETED', 'A completed request cannot be edited. Reopen it first.');
    }
    throw new AppError(
      409,
      'VERSION_CONFLICT',
      'This request was changed by someone else. Reload it and try again.',
      { currentVersion: current.version }
    );
  }

  return getRequestForUser(actor, id);
}

// Look up a developer in the actor's organization and verify they are active.
async function findActiveDeveloper(trx: Knex.Transaction, organizationId: number, developerId: number) {
  const user = await trx('users')
    .select('id', 'name', 'role', 'is_active', 'organization_id')
    .where({ id: developerId, organization_id: organizationId })
    .first();

  if (!user || user.role !== 'developer') {
    throw new AppError(400, 'INVALID_ASSIGNEE', 'Assignee must be a developer in your organization.');
  }
  if (!user.is_active) {
    throw new AppError(400, 'ASSIGNEE_INACTIVE', 'Cannot assign an inactive developer.');
  }

  return user;
}

// 1. First assignment: Manager assigns a request currently in "Under Review".
// Automatically moves status to "Assigned" and records two audit entries.
export async function assignRequest(actor: AuthUser, id: number, version: number, assigneeId: number) {
  const organizationId = organizationIdOf(actor);

  await db.transaction(async (trx) => {
    // 1. Verify developer belongs to the same org and is active
    await findActiveDeveloper(trx, organizationId, assigneeId);

    // 2. Perform optimistic update: must match id, org, version, and status 'Under Review'
    const updated = await trx('service_requests')
      .where({ id, organization_id: organizationId, version, status: 'Under Review' })
      .update({
        assignee_id: assigneeId,
        status: 'Assigned',
        version: trx.raw('version + 1'),
        updated_at: trx.fn.now(),
      })
      .returning(['id', 'version']);

    if (updated.length === 0) {
      const current = await trx('service_requests')
        .select('status', 'version')
        .where({ id, organization_id: organizationId })
        .first();

      if (!current) {
        throw new AppError(404, 'NOT_FOUND', 'Request not found.');
      }
      if (current.status !== 'Under Review') {
        throw new AppError(400, 'INVALID_TRANSITION', 'Requests can only be assigned while Under Review.');
      }
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'This request was changed by someone else. Reload it and try again.',
        { currentVersion: current.version }
      );
    }

    // 3. Write audit log for assignment
    await writeAudit(trx, {
      organizationId,
      requestId: id,
      actorId: actor.id,
      action: 'REQUEST_ASSIGNED',
      newValue: { assignee_id: assigneeId },
    });

    // 4. Write audit log for status change
    await writeAudit(trx, {
      organizationId,
      requestId: id,
      actorId: actor.id,
      action: 'STATUS_CHANGED',
      oldValue: { status: 'Under Review' },
      newValue: { status: 'Assigned' },
    });
  });

  return getRequestForUser(actor, id);
}

// 2. Reassignment: Manager reassigns a request currently in Assigned, In Progress, or Reopened.
// Requires a reason and leaves the status unchanged.
export async function reassignRequest(
  actor: AuthUser,
  id: number,
  version: number,
  newAssigneeId: number,
  reason: string
) {
  const organizationId = organizationIdOf(actor);

  await db.transaction(async (trx) => {
    // 1. Verify developer belongs to same org and is active
    await findActiveDeveloper(trx, organizationId, newAssigneeId);

    // 2. Read current assignee to ensure we are not reassigning to the same person
    const current = await trx('service_requests')
      .select('assignee_id', 'status', 'version')
      .where({ id, organization_id: organizationId })
      .first();

    if (!current) {
      throw new AppError(404, 'NOT_FOUND', 'Request not found.');
    }

    const allowedStatuses: RequestStatus[] = ['Assigned', 'In Progress', 'Reopened'];
    if (!allowedStatuses.includes(current.status as RequestStatus)) {
      throw new AppError(
        400,
        'INVALID_STATE',
        `Cannot reassign a request with status ${current.status}. Reassignment is only allowed for Assigned, In Progress, or Reopened.`
      );
    }

    if (current.assignee_id === newAssigneeId) {
      throw new AppError(400, 'ALREADY_ASSIGNED', 'The request is already assigned to this developer.');
    }

    if (current.version !== version) {
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'This request was changed by someone else. Reload it and try again.',
        { currentVersion: current.version }
      );
    }

    // 3. Perform update
    await trx('service_requests')
      .where({ id, organization_id: organizationId, version })
      .update({
        assignee_id: newAssigneeId,
        version: trx.raw('version + 1'),
        updated_at: trx.fn.now(),
      });

    // 4. Write audit log
    await writeAudit(trx, {
      organizationId,
      requestId: id,
      actorId: actor.id,
      action: 'REQUEST_REASSIGNED',
      oldValue: { assignee_id: current.assignee_id },
      newValue: { assignee_id: newAssigneeId },
      reason: reason.trim(),
    });
  });

  return getRequestForUser(actor, id);
}

// 3. Status Transition: Move request through its lifecycle.
export async function transitionRequestStatus(
  actor: AuthUser,
  id: number,
  version: number,
  newStatus: RequestStatus,
  reason?: string
) {
  const organizationId = organizationIdOf(actor);

  await db.transaction(async (trx) => {
    const current = await trx('service_requests')
      .select('id', 'status', 'assignee_id', 'version')
      .where({ id, organization_id: organizationId })
      .first();

    if (!current) {
      throw new AppError(404, 'NOT_FOUND', 'Request not found.');
    }

    if (current.version !== version) {
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'This request was changed by someone else. Reload it and try again.',
        { currentVersion: current.version }
      );
    }

    const fromStatus = current.status as RequestStatus;

    if (fromStatus === newStatus) {
      throw new AppError(400, 'SAME_STATUS', `Request is already in ${newStatus} status.`);
    }

    // Enforce transition matrix and role permissions
    // 1. Submitted -> Under Review (Manager only)
    if (fromStatus === 'Submitted' && newStatus === 'Under Review') {
      if (actor.role !== 'manager') {
        throw new AppError(403, 'FORBIDDEN', 'Only managers can move requests to Under Review.');
      }
    }
    // 2. Assigned -> In Progress (Assigned developer only)
    else if (fromStatus === 'Assigned' && newStatus === 'In Progress') {
      if (actor.role !== 'developer' || current.assignee_id !== actor.id) {
        throw new AppError(403, 'FORBIDDEN', 'Only the assigned developer can start progress on this request.');
      }
    }
    // 3. In Progress -> Completed (Assigned developer only)
    else if (fromStatus === 'In Progress' && newStatus === 'Completed') {
      if (actor.role !== 'developer' || current.assignee_id !== actor.id) {
        throw new AppError(403, 'FORBIDDEN', 'Only the assigned developer can complete this request.');
      }
    }
    // 4. Completed -> Reopened (Manager only, reason required)
    else if (fromStatus === 'Completed' && newStatus === 'Reopened') {
      if (actor.role !== 'manager') {
        throw new AppError(403, 'FORBIDDEN', 'Only managers can reopen a completed request.');
      }
      if (!reason || reason.trim() === '') {
        throw new AppError(400, 'REASON_REQUIRED', 'A reason is required when reopening a request.');
      }
    }
    // 5. Reopened -> In Progress (Assigned developer only)
    else if (fromStatus === 'Reopened' && newStatus === 'In Progress') {
      if (actor.role !== 'developer' || current.assignee_id !== actor.id) {
        throw new AppError(403, 'FORBIDDEN', 'Only the assigned developer can resume progress on this request.');
      }
    } else {
      throw new AppError(
        400,
        'INVALID_TRANSITION',
        `Transition from "${fromStatus}" to "${newStatus}" is not permitted.`
      );
    }

    // Prepare fields to update
    const updateFields: Record<string, unknown> = {
      status: newStatus,
      version: trx.raw('version + 1'),
      updated_at: trx.fn.now(),
    };

    // Setting completed_at when completed; clearing it when reopened
    if (newStatus === 'Completed') {
      updateFields.completed_at = trx.fn.now();
    } else if (newStatus === 'Reopened') {
      updateFields.completed_at = null;
    }

    await trx('service_requests')
      .where({ id, organization_id: organizationId, version })
      .update(updateFields);

    // Record audit log
    await writeAudit(trx, {
      organizationId,
      requestId: id,
      actorId: actor.id,
      action: 'STATUS_CHANGED',
      oldValue: { status: fromStatus },
      newValue: { status: newStatus },
      reason: reason ? reason.trim() : null,
    });
  });

  return getRequestForUser(actor, id);
}