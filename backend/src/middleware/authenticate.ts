import type { NextFunction, Request, Response } from 'express';
import { db } from '../db';
import { AppError } from '../utils/AppError';
import { verifyToken } from '../utils/jwt';

export type Role = 'system_admin' | 'manager' | 'developer';

// The logged-in user, as loaded from the DATABASE (never from anything the client sent).
export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  organizationId: number | null; // null only for the System Admin
};

// Tell TypeScript that Express requests may carry a "user" property.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Runs before protected routes. It:
// 1. reads the "Authorization: Bearer <token>" header,
// 2. checks the token,
// 3. loads the user from the database and refuses inactive users,
// 4. puts the user on req.user for the route to use.
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required. Please log in.');
  }

  const token = header.slice('Bearer '.length).trim();
  const userId = verifyToken(token);

  const row = await db('users')
    .select('id', 'name', 'email', 'role', 'organization_id', 'is_active')
    .where({ id: userId })
    .first();

  // The token was valid, but the user no longer exists.
  if (!row) {
    throw new AppError(401, 'INVALID_TOKEN', 'The login token is not valid.');
  }

  // Deactivated users are locked out immediately, even if their token has not expired.
  if (!row.is_active) {
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated.');
  }

  req.user = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    organizationId: row.organization_id,
  };
  next();
}