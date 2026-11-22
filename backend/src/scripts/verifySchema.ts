import type { Knex } from 'knex';
import { db } from '../db';

// This script proves that the DATABASE ITSELF rejects invalid data.
// It inserts good and bad rows inside a transaction and always rolls everything back,
// so it leaves no data behind. Run it with: npm run db:verify

type Trx = Knex.Transaction;
type Expected = { constraint?: string; code?: string };

let passed = 0;
let failed = 0;

// A sentinel error used only to roll back the big transaction at the end.
class RollbackAll extends Error {}

function report(ok: boolean, label: string, detail = ''): void {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
}

// This statement must be ACCEPTED by the database.
async function expectAccepted(trx: Trx, label: string, action: (t: Trx) => Promise<unknown>): Promise<void> {
  try {
    await trx.transaction(async (savepoint) => {
      await action(savepoint);
    });
    report(true, label);
  } catch (error) {
    report(false, label, (error as Error).message);
  }
}

// This statement must be REJECTED by the database, by the named rule (or error code).
async function expectRejected(
  trx: Trx,
  label: string,
  expected: Expected,
  action: (t: Trx) => Promise<unknown>
): Promise<void> {
  try {
    await trx.transaction(async (savepoint) => {
      await action(savepoint);
    });
    report(false, label, 'the database accepted it, but it should have been rejected');
  } catch (error) {
    const err = error as { code?: string; constraint?: string; message?: string };
    const matches =
      (expected.constraint !== undefined && err.constraint === expected.constraint) ||
      (expected.code !== undefined && err.code === expected.code);
    const wanted = expected.constraint ?? expected.code;
    report(matches, label, matches ? '' : `rejected by "${err.constraint ?? err.code}", expected "${wanted}"`);
  }
}

async function runChecks(trx: Trx): Promise<void> {
  const inOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // ---- Test data (rolled back at the end) ----
  const [orgA] = await trx('organizations').insert({ name: 'Verify Org A' }).returning('id');
  const [orgB] = await trx('organizations').insert({ name: 'Verify Org B' }).returning('id');

  const newUser = (organizationId: number | null, role: string, email: string) => ({
    organization_id: organizationId,
    name: 'Verify User',
    email,
    password_hash: 'not-a-real-hash',
    role,
  });

  const [managerA] = await trx('users').insert(newUser(orgA.id, 'manager', 'verify-manager-a@example.test')).returning('id');
  const [devA] = await trx('users').insert(newUser(orgA.id, 'developer', 'verify-dev-a@example.test')).returning('id');
  const [devB] = await trx('users').insert(newUser(orgB.id, 'developer', 'verify-dev-b@example.test')).returning('id');

  const newRequest = (overrides: Record<string, unknown> = {}) => ({
    title: 'Verify request',
    description: 'Created by the verification script',
    priority: 'High',
    category: 'Bug Fix',
    organization_id: orgA.id,
    created_by: managerA.id,
    deadline: inOneDay,
    ...overrides,
  });

  const [request] = await trx('service_requests').insert(newRequest()).returning(['id', 'reference_number', 'status', 'version']);

  // ---- Users ----
  console.log('\nUsers');
  await expectAccepted(trx, 'System Admin without an organization is accepted', (t) =>
    t('users').insert(newUser(null, 'system_admin', 'verify-admin@example.test'))
  );
  await expectRejected(trx, 'Manager without an organization is rejected', { constraint: 'users_org_matches_role' }, (t) =>
    t('users').insert(newUser(null, 'manager', 'verify-x1@example.test'))
  );
  await expectRejected(trx, 'System Admin WITH an organization is rejected', { constraint: 'users_org_matches_role' }, (t) =>
    t('users').insert(newUser(orgA.id, 'system_admin', 'verify-x2@example.test'))
  );
  await expectRejected(trx, 'Unknown role is rejected', { constraint: 'users_role_valid' }, (t) =>
    t('users').insert(newUser(orgA.id, 'superuser', 'verify-x3@example.test'))
  );
  await expectRejected(trx, 'Same email in different letter case is rejected', { constraint: 'users_email_unique' }, (t) =>
    t('users').insert(newUser(orgB.id, 'developer', 'VERIFY-DEV-A@example.test'))
  );

  // ---- Service requests: defaults ----
  console.log('\nService requests: defaults');
  report(request.status === 'Submitted', 'New request starts as "Submitted"');
  report(request.version === 1, 'New request starts at version 1');
  report(/^SR-\d{6,}$/.test(request.reference_number), `Reference number was generated automatically (${request.reference_number})`);

  // ---- Service requests: validation ----
  console.log('\nService requests: validation');
  await expectRejected(trx, 'Invalid priority is rejected', { constraint: 'service_requests_priority_valid' }, (t) =>
    t('service_requests').insert(newRequest({ priority: 'Urgent' }))
  );
  await expectRejected(trx, 'Invalid category is rejected', { constraint: 'service_requests_category_valid' }, (t) =>
    t('service_requests').insert(newRequest({ category: 'Cooking' }))
  );
  await expectRejected(trx, 'Invalid status is rejected', { constraint: 'service_requests_status_valid' }, (t) =>
    t('service_requests').insert(newRequest({ status: 'Finished' }))
  );
  await expectRejected(trx, 'Blank title is rejected', { constraint: 'service_requests_title_valid' }, (t) =>
    t('service_requests').insert(newRequest({ title: '   ' }))
  );
  await expectRejected(trx, 'Missing deadline is rejected', { code: '23502' }, (t) =>
    t('service_requests').insert(newRequest({ deadline: null }))
  );
  await expectRejected(trx, 'Malformed reference number is rejected', { constraint: 'service_requests_reference_format' }, (t) =>
    t('service_requests').insert(newRequest({ reference_number: 'ABC-1' }))
  );
  await expectRejected(trx, 'Duplicate reference number is rejected', { constraint: 'service_requests_reference_number_unique' }, (t) =>
    t('service_requests').insert(newRequest({ reference_number: request.reference_number }))
  );

  // ---- Service requests: organization isolation ----
  console.log('\nService requests: organization isolation');
  await expectAccepted(trx, 'Assigning a developer of the SAME organization is accepted', (t) =>
    t('service_requests').insert(newRequest({ status: 'Assigned', assignee_id: devA.id }))
  );
  await expectRejected(trx, 'Assigning a developer from ANOTHER organization is rejected', { constraint: 'service_requests_assignee_same_org_fk' }, (t) =>
    t('service_requests').insert(newRequest({ status: 'Assigned', assignee_id: devB.id }))
  );
  await expectRejected(trx, 'A creator from ANOTHER organization is rejected', { constraint: 'service_requests_creator_same_org_fk' }, (t) =>
    t('service_requests').insert(newRequest({ created_by: devB.id }))
  );

  // ---- Service requests: assignee and completed_at rules ----
  console.log('\nService requests: assignee and completion rules');
  for (const status of ['Assigned', 'In Progress', 'Reopened']) {
    await expectRejected(trx, `Status "${status}" without an assignee is rejected`, { constraint: 'service_requests_assignee_required_for_status' }, (t) =>
      t('service_requests').insert(newRequest({ status }))
    );
  }
  await expectRejected(trx, 'completed_at on a non-Completed request is rejected', { constraint: 'service_requests_completed_at_matches_status' }, (t) =>
    t('service_requests').insert(newRequest({ status: 'In Progress', assignee_id: devA.id, completed_at: new Date() }))
  );
  await expectRejected(trx, 'Completed request without completed_at is rejected', { constraint: 'service_requests_completed_at_matches_status' }, (t) =>
    t('service_requests').insert(newRequest({ status: 'Completed', assignee_id: devA.id }))
  );
  await expectAccepted(trx, 'Completed request with assignee and completed_at is accepted', (t) =>
    t('service_requests').insert(newRequest({ status: 'Completed', assignee_id: devA.id, completed_at: new Date() }))
  );

  // ---- Audit logs ----
  console.log('\nAudit logs');
  const audit = (overrides: Record<string, unknown>) => ({
    organization_id: orgA.id,
    actor_id: managerA.id,
    request_id: request.id,
    action: 'REQUEST_CREATED',
    ...overrides,
  });

  await expectAccepted(trx, 'Request creation entry is accepted', (t) =>
    t('audit_logs').insert(audit({ new_value: JSON.stringify({ status: 'Submitted' }) }))
  );
  await expectAccepted(trx, 'Reassignment with a reason is accepted', (t) =>
    t('audit_logs').insert(audit({ action: 'REQUEST_REASSIGNED', reason: 'Original developer is on leave' }))
  );
  await expectAccepted(trx, 'Reopening with a reason is accepted', (t) =>
    t('audit_logs').insert(
      audit({
        action: 'STATUS_CHANGED',
        old_value: JSON.stringify({ status: 'Completed' }),
        new_value: JSON.stringify({ status: 'Reopened' }),
        reason: 'Client found a remaining issue',
      })
    )
  );
  await expectAccepted(trx, 'User deactivation entry (no request, with target user) is accepted', (t) =>
    t('audit_logs').insert(
      audit({
        action: 'USER_DEACTIVATED',
        request_id: null,
        target_user_id: devA.id,
        old_value: JSON.stringify({ is_active: true }),
        new_value: JSON.stringify({ is_active: false }),
      })
    )
  );
  await expectRejected(trx, 'Reassignment WITHOUT a reason is rejected', { constraint: 'audit_logs_reassign_needs_reason' }, (t) =>
    t('audit_logs').insert(audit({ action: 'REQUEST_REASSIGNED' }))
  );
  await expectRejected(trx, 'Reopening WITHOUT a reason is rejected', { constraint: 'audit_logs_reopen_needs_reason' }, (t) =>
    t('audit_logs').insert(
      audit({
        action: 'STATUS_CHANGED',
        old_value: JSON.stringify({ status: 'Completed' }),
        new_value: JSON.stringify({ status: 'Reopened' }),
      })
    )
  );
  await expectRejected(trx, 'Status change without old/new values is rejected', { constraint: 'audit_logs_status_change_needs_values' }, (t) =>
    t('audit_logs').insert(audit({ action: 'STATUS_CHANGED' }))
  );
  await expectRejected(trx, 'Unknown action name is rejected', { constraint: 'audit_logs_action_valid' }, (t) =>
    t('audit_logs').insert(audit({ action: 'SOMETHING_ELSE' }))
  );
  await expectRejected(trx, 'User deactivation without a target user is rejected', { constraint: 'audit_logs_subject_matches_action' }, (t) =>
    t('audit_logs').insert(audit({ action: 'USER_DEACTIVATED', request_id: null }))
  );
  await expectRejected(trx, 'Audit entry in organization B pointing at a request of organization A is rejected', { constraint: 'audit_logs_request_same_org_fk' }, (t) =>
    t('audit_logs').insert(audit({ organization_id: orgB.id, actor_id: devB.id }))
  );

  // ---- Nothing is deleted ----
  console.log('\nProtection against deletion');
  await expectRejected(trx, 'Deleting a user that history depends on is rejected', { code: '23503' }, (t) =>
    t('users').where({ id: managerA.id }).del()
  );
}

async function resetReferenceCounterIfEmpty(): Promise<void> {
  // Our test inserts used up some reference numbers. If no real request exists yet,
  // start the counter again so your first real request is SR-000001.
  const row = await db('service_requests').count({ total: '*' }).first();
  if (Number(row?.total ?? 0) === 0) {
    await db.raw('ALTER SEQUENCE service_request_number_seq RESTART WITH 1');
  }
}

async function main(): Promise<void> {
  console.log('Checking database rules (nothing is saved)...');

  try {
    await db.transaction(async (trx) => {
      await runChecks(trx);
      throw new RollbackAll();
    });
  } catch (error) {
    if (!(error instanceof RollbackAll)) {
      throw error;
    }
  }

  await resetReferenceCounterIfEmpty();

  console.log(`\nResult: ${passed} passed, ${failed} failed.`);
  await db.destroy();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('\nThe verification script crashed:', error.message);
  await db.destroy();
  process.exit(1);
});