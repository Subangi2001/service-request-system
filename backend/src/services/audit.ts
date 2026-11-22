import type { Knex } from 'knex';

export type AuditAction =
  | 'REQUEST_CREATED'
  | 'REQUEST_ASSIGNED'
  | 'REQUEST_REASSIGNED'
  | 'STATUS_CHANGED'
  | 'USER_DEACTIVATED';

export type AuditEntry = {
  organizationId: number;
  requestId?: number | null;
  targetUserId?: number | null;
  actorId: number;
  action: AuditAction;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
};

// Write one audit entry.
// It REQUIRES a transaction (not the plain database connection). That forces every caller to save
// the business change and its audit entry together: both succeed, or both are rolled back.
export async function writeAudit(trx: Knex.Transaction, entry: AuditEntry): Promise<void> {
  await trx('audit_logs').insert({
    organization_id: entry.organizationId,
    request_id: entry.requestId ?? null,
    target_user_id: entry.targetUserId ?? null,
    actor_id: entry.actorId,
    action: entry.action,
    old_value: entry.oldValue === undefined || entry.oldValue === null ? null : JSON.stringify(entry.oldValue),
    new_value: entry.newValue === undefined || entry.newValue === null ? null : JSON.stringify(entry.newValue),
    reason: entry.reason ?? null,
  });
}