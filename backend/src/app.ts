import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { checkDatabaseConnection } from './db';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { organizationsRouter } from './routes/organizations';
import { usersRouter } from './routes/users';

// Build the Express application. server.ts starts it; tests will import it directly.
export const app = express();

// Do not advertise that this is an Express server.
app.disable('x-powered-by');

// Only allow the React app (and nobody else's website) to call this API from a browser.
app.use(cors({ origin: env.corsOrigin }));

// Let the API read JSON request bodies.
app.use(express.json());

// Health check: proves the server is running AND the database is reachable.
app.get('/health', async (_req, res) => {
  await checkDatabaseConnection();
  res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/organizations', organizationsRouter);
app.use('/api/users', usersRouter);

// These two must stay LAST.
app.use(notFoundHandler);
app.use(errorHandler);