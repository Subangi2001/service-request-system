import { app } from './app';
import { env } from './config/env';
import { checkDatabaseConnection, db } from './db';

async function start(): Promise<void> {
  // Fail early with a clear message if the database cannot be reached.
  await checkDatabaseConnection();
  console.log(`Database connected (${env.db.database} on ${env.db.host}:${env.db.port}).`);

  const server = app.listen(env.port, () => {
    console.log(`API running at http://localhost:${env.port}`);
  });

  // Close things cleanly when you press Ctrl + C.
  const shutdown = async (): Promise<void> => {
    console.log('Shutting down...');
    server.close();
    await db.destroy();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('Could not start the server:', error.message);
  process.exit(1);
});