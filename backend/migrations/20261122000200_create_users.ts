import type { Knex } from 'knex';

// Table 2 of 4: users (System Admin, managers and developers).
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE users (
      id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      organization_id  BIGINT REFERENCES organizations (id) ON DELETE RESTRICT,
      name             TEXT        NOT NULL,
      email            TEXT        NOT NULL,
      password_hash    TEXT        NOT NULL,
      role             TEXT        NOT NULL,
      is_active        BOOLEAN     NOT NULL DEFAULT true,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT users_name_not_blank  CHECK (btrim(name) <> ''),
      CONSTRAINT users_email_not_blank CHECK (btrim(email) <> ''),
      CONSTRAINT users_role_valid      CHECK (role IN ('system_admin', 'manager', 'developer')),

      -- The System Admin has NO organization. Managers and developers MUST have one.
      CONSTRAINT users_org_matches_role CHECK (
        (role = 'system_admin' AND organization_id IS NULL)
        OR (role <> 'system_admin' AND organization_id IS NOT NULL)
      ),

      -- Needed so other tables can link to (organization_id, id) pairs ("same organization" guard).
      CONSTRAINT users_org_id_unique UNIQUE (organization_id, id)
    )
  `);

  // One login per email address, ignoring upper/lower case.
  await knex.raw('CREATE UNIQUE INDEX users_email_unique ON users (lower(email))');

  // Speeds up "active developers of my organization".
  await knex.raw('CREATE INDEX users_org_role_active_idx ON users (organization_id, role, is_active)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS users');
}