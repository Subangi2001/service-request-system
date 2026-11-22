import type { Knex } from 'knex';

// Table 1 of 4: organizations (the client companies).
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE organizations (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name        TEXT        NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT organizations_name_unique    UNIQUE (name),
      CONSTRAINT organizations_name_not_blank CHECK (btrim(name) <> '')
    )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS organizations');
}