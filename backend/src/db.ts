import knex from 'knex';
import config from '../knexfile';

// One shared database connection pool for the whole application.
export const db = knex(config);

// Ask the database a trivial question to prove the connection works.
export async function checkDatabaseConnection(): Promise<void> {
  await db.raw('SELECT 1');
}