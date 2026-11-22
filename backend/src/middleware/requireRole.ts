import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import type { Role } from './authenticate';

// Use AFTER authenticate. Example: router.post('/', authenticate, requireRole('manager'), handler)
// Only users whose role (loaded from the database) is in the list may continue.
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required. Please log in.');
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
    }
    next();
  };
}