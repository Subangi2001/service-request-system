import type { Knex } from 'knex';

// Table 4 of 4: audit_logs (the permanent history of important actions).
// The application only ever INSERTs and SELECTs this table. It never updates or deletes rows.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE audit_logs (
      id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      organization_id  BIGINT      NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
      request_id       BIGINT,
      target_user_id   BIGINT,
      actor_id         BIGINT      NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      action           TEXT        NOT NULL,
      old_value        JSONB,
      new_value        JSONB,
      reason           TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT audit_logs_action_valid CHECK (action IN (
        'REQUEST_CREATED', 'REQUEST_ASSIGNED', 'REQUEST_REASSIGNED', 'STATUS_CHANGED', 'USER_DEACTIVATED'
      )),

      -- "Same organization" guards: the request and the affected user must belong to the entry's organization.
      CONSTRAINT audit_logs_request_same_org_fk
        FOREIGN KEY (organization_id, request_id)
        REFERENCES service_requests (organization_id, id) ON DELETE RESTRICT,
      CONSTRAINT audit_logs_target_user_same_org_fk
        FOREIGN KEY (organization_id, target_user_id)
        REFERENCES users (organization_id, id) ON DELETE RESTRICT,

      -- Request actions must name a request. User deactivation must name a user. Never both.
      CONSTRAINT audit_logs_subject_matches_action CHECK (
        (action = 'USER_DEACTIVATED' AND target_user_id IS NOT NULL AND request_id IS NULL)
        OR (action <> 'USER_DEACTIVATED' AND request_id IS NOT NULL AND target_user_id IS NULL)
      ),

      -- Reassignment always needs a reason.
      CONSTRAINT audit_logs_reassign_needs_reason CHECK (
        action <> 'REQUEST_REASSIGNED' OR (reason IS NOT NULL AND btrim(reason) <> '')
      ),

      -- A status change must record the old and the new value.
      CONSTRAINT audit_logs_status_change_needs_values CHECK (
        action <> 'STATUS_CHANGED' OR (old_value IS NOT NULL AND new_value IS NOT NULL)
      ),

      -- Reopening a request (new status = Reopened) always needs a reason.
      CONSTRAINT audit_logs_reopen_needs_reason CHECK (
        action <> 'STATUS_CHANGED'
        OR (new_value ->> 'status') IS DISTINCT FROM 'Reopened'
        OR (reason IS NOT NULL AND btrim(reason) <> '')
      )
    )
  `);

  await knex.raw('CREATE INDEX audit_logs_org_created_idx ON audit_logs (organization_id, created_at, id)');
  await knex.raw('CREATE INDEX audit_logs_request_idx ON audit_logs (request_id)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS audit_logs');
}