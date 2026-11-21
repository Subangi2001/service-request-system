import type { Knex } from 'knex';
import { env } from './src/config/env';

// Knex settings. Used by the Knex command line tool (migrations and seeds)
// and by src/db.ts (the running application).
const config: Knex.Config = {
  client: 'pg',
  connection: {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  },
  pool: { min: 0, max: 10 },
  migrations: {
    directory: './migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './seeds',
    extension: 'ts',
  },
};

export default config;