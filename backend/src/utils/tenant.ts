import type { AuthUser } from '../middleware/authenticate';
import { AppError } from './AppError';

// The ONE place where "which organization does this user belong to?" is answered.
// It always comes from the logged-in user (loaded from the database), never from the request.
// Only the System Admin has no organization, and the Admin never uses organization-scoped routes.
export function organizationIdOf(user: AuthUser): number {
  if (user.organizationId === null) {
    throw new AppError(403, 'NO_ORGANIZATION', 'This account does not belong to an organization.');
  }
  return user.organizationId;
}