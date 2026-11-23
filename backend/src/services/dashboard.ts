import { db } from '../db';
import type { AuthUser } from '../middleware/authenticate';
import { organizationIdOf } from '../utils/tenant';

export type RequestCounts = {
  total: number;
  pending: number;   // Submitted + Under Review
  active: number;    // Assigned + In Progress + Reopened
  completed: number; // Completed
  overdue: number;   // deadline < now AND status <> 'Completed'
};

export type DeveloperWorkload = {
  id: number;
  name: string;
  email: string;
  activeRequestsCount: number;
};

// 1. Manager Dashboard Stats (Organization-wide)
export async function getManagerDashboard(user: AuthUser) {
  const orgId = organizationIdOf(user);

  // Single SQL aggregation query to count requests by status and overdue flag
  const countsRow = await db('service_requests')
    .where({ organization_id: orgId })
    .select(
      db.raw('count(*)::int as total'),
      db.raw("count(*) filter (where status in ('Submitted', 'Under Review'))::int as pending"),
      db.raw("count(*) filter (where status in ('Assigned', 'In Progress', 'Reopened'))::int as active"),
      db.raw("count(*) filter (where status = 'Completed')::int as completed"),
      db.raw("count(*) filter (where deadline < now() and status <> 'Completed')::int as overdue")
    )
    .first();

  const counts: RequestCounts = {
    total: Number(countsRow?.total ?? 0),
    pending: Number(countsRow?.pending ?? 0),
    active: Number(countsRow?.active ?? 0),
    completed: Number(countsRow?.completed ?? 0),
    overdue: Number(countsRow?.overdue ?? 0),
  };

  // Developer workload: lists all active developers in the organization
  // and how many active requests (Assigned, In Progress, Reopened) each currently has
  const workloadRows = await db('users as u')
    .leftJoin('service_requests as r', function () {
      this.on('r.assignee_id', '=', 'u.id').andOnIn('r.status', [
        'Assigned',
        'In Progress',
        'Reopened',
      ]);
    })
    .where({ 'u.organization_id': orgId, 'u.role': 'developer', 'u.is_active': true })
    .groupBy('u.id', 'u.name', 'u.email')
    .select('u.id', 'u.name', 'u.email')
    .select(db.raw('count(r.id)::int as active_requests_count'))
    .orderBy([{ column: 'active_requests_count', order: 'desc' }, { column: 'u.name' }]);

  const workload: DeveloperWorkload[] = workloadRows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    activeRequestsCount: Number(row.active_requests_count ?? 0),
  }));

  return { counts, workload };
}

// 2. Developer Dashboard Stats (Assigned to logged-in developer only)
export async function getDeveloperDashboard(user: AuthUser) {
  const orgId = organizationIdOf(user);

  const countsRow = await db('service_requests')
    .where({ organization_id: orgId, assignee_id: user.id })
    .select(
      db.raw('count(*)::int as total'),
      db.raw("count(*) filter (where status in ('Assigned', 'Reopened'))::int as pending_action"),
      db.raw("count(*) filter (where status = 'In Progress')::int as in_progress"),
      db.raw("count(*) filter (where status = 'Completed')::int as completed"),
      db.raw("count(*) filter (where deadline < now() and status <> 'Completed')::int as overdue")
    )
    .first();

  return {
    counts: {
      total: Number(countsRow?.total ?? 0),
      pendingAction: Number(countsRow?.pending_action ?? 0),
      inProgress: Number(countsRow?.in_progress ?? 0),
      completed: Number(countsRow?.completed ?? 0),
      overdue: Number(countsRow?.overdue ?? 0),
    },
  };
}