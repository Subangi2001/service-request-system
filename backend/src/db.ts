import knex from 'knex';
import { types } from 'pg';
import config from '../knexfile';

// PostgreSQL BIGINT columns (our ids, and COUNT results) are returned by the driver as text by default.
// Convert them to normal JavaScript numbers so ids can be compared and used easily.
// (Safe here: our numbers will never get anywhere near the JavaScript limit.)
types.setTypeParser(types.builtins.INT8, (value: string) => parseInt(value, 10));

// One shared database connection pool for the whole application.
export const db = knex(config);

// Ask the database a trivial question to prove the connection works.
export async function checkDatabaseConnection(): Promise<void> {
  await db.raw('SELECT 1');
}