import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Add must_change_password flag to users
  await knex.schema.alterTable('users', (table) => {
    table.boolean('must_change_password').notNullable().defaultTo(false);
  });

  // 2. Create password_reset_tokens table
  await knex.raw(`
    CREATE TABLE password_reset_tokens (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      used_at     TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT password_reset_tokens_hash_unique UNIQUE (token_hash)
    )
  `);

  await knex.raw('CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id)');
  await knex.raw('CREATE INDEX password_reset_tokens_hash_idx ON password_reset_tokens (token_hash)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS password_reset_tokens');
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('must_change_password');
  });
}