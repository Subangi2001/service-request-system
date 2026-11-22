import type { Knex } from 'knex';

// Table 3 of 4: service_requests.
export async function up(knex: Knex): Promise<void> {
  // One counter shared by all organizations. It produces SR-000001, SR-000002, ...
  await knex.raw('CREATE SEQUENCE service_request_number_seq');

  await knex.raw(`
    CREATE TABLE service_requests (
      id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      reference_number  TEXT NOT NULL
                        DEFAULT ('SR-' || lpad(nextval('service_request_number_seq')::text, 6, '0')),
      title             TEXT        NOT NULL,
      description       TEXT        NOT NULL,
      priority          TEXT        NOT NULL,
      category          TEXT        NOT NULL,
      organization_id   BIGINT      NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
      created_by        BIGINT      NOT NULL,
      assignee_id       BIGINT,
      deadline          TIMESTAMPTZ NOT NULL,
      status            TEXT        NOT NULL DEFAULT 'Submitted',
      completed_at      TIMESTAMPTZ,
      version           INTEGER     NOT NULL DEFAULT 1,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT service_requests_reference_number_unique UNIQUE (reference_number),
      CONSTRAINT service_requests_reference_format CHECK (reference_number ~ '^SR-[0-9]{6,}$'),
      CONSTRAINT service_requests_title_valid
        CHECK (btrim(title) <> '' AND char_length(title) <= 200),
      CONSTRAINT service_requests_description_not_blank CHECK (btrim(description) <> ''),
      CONSTRAINT service_requests_priority_valid
        CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
      CONSTRAINT service_requests_category_valid
        CHECK (category IN ('Bug Fix', 'New Feature', 'Maintenance', 'Technical Support', 'Other')),
      CONSTRAINT service_requests_status_valid
        CHECK (status IN ('Submitted', 'Under Review', 'Assigned', 'In Progress', 'Completed', 'Reopened')),
      CONSTRAINT service_requests_version_valid CHECK (version >= 1),

      -- These four statuses always need an assignee.
      CONSTRAINT service_requests_assignee_required_for_status CHECK (
        status NOT IN ('Assigned', 'In Progress', 'Completed', 'Reopened')
        OR assignee_id IS NOT NULL
      ),

      -- completed_at is filled if and only if the status is Completed.
      CONSTRAINT service_requests_completed_at_matches_status CHECK (
        (status = 'Completed') = (completed_at IS NOT NULL)
      ),

      -- Needed so audit_logs can link to (organization_id, id) pairs.
      CONSTRAINT service_requests_org_id_unique UNIQUE (organization_id, id),

      -- "Same organization" guards: the creator and the assignee must belong to the request's organization.
      CONSTRAINT service_requests_creator_same_org_fk
        FOREIGN KEY (organization_id, created_by)
        REFERENCES users (organization_id, id) ON DELETE RESTRICT,
      CONSTRAINT service_requests_assignee_same_org_fk
        FOREIGN KEY (organization_id, assignee_id)
        REFERENCES users (organization_id, id) ON DELETE RESTRICT
    )
  `);

  await knex.raw('CREATE INDEX service_requests_org_status_idx   ON service_requests (organization_id, status)');
  await knex.raw('CREATE INDEX service_requests_org_assignee_idx ON service_requests (organization_id, assignee_id)');
  await knex.raw('CREATE INDEX service_requests_org_deadline_idx ON service_requests (organization_id, deadline)');
  await knex.raw('CREATE INDEX service_requests_org_created_idx  ON service_requests (organization_id, created_at, id)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS service_requests');
  await knex.raw('DROP SEQUENCE IF EXISTS service_request_number_seq');
}