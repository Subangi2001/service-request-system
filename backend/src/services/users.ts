import { db } from '../db';
import type { AuthUser, Role } from '../middleware/authenticate';
import { AppError } from '../utils/AppError';
import { isUniqueViolation } from '../utils/dbErrors';
import { hashPassword } from '../utils/password';
import { writeAudit } from './audit';

// A user row as stored in the database (the password hash is never selected).
export type UserRecord = {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  organization_id: number | null;
  created_at: Date;
};

export const USER_COLUMNS = [
  'id',
  'name',
  'email',
  'role',
  'is_active',
  'must_change_password',
  'organization_id',
  'created_at',
];

// The shape sent to the client.
export function toUserResponse(row: UserRecord) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
    organizationId: row.organization_id,
    createdAt: row.created_at,
  };
}

// Create a manager or developer inside the given organization.
// Newly created accounts are marked with must_change_password: true.
export async function createUser(input: {
  organizationId: number;
  role: 'manager' | 'developer';
  name: string;
  email: string;
  password: string;
}): Promise<UserRecord> {
  const passwordHash = await hashPassword(input.password);
  try {
    const [row] = await db('users')
      .insert({
        organization_id: input.organizationId,
        name: input.name.trim(),
        email: input.email,
        password_hash: passwordHash,
        role: input.role,
        is_active: true,
        must_change_password: true,
      })
      .returning(USER_COLUMNS);
    return row;
  } catch (error) {
    if (isUniqueViolation(error, 'users_email_unique')) {
      throw new AppError(409, 'EMAIL_ALREADY_USED', 'A user with this email address already exists.');
    }
    throw error;
  }
}

// Activate or deactivate a user.
// Deactivation writes an audit entry in the SAME transaction as the change.
// If the user is already in the requested state, nothing changes and nothing is logged.
export async function setUserActive(input: {
  actor: AuthUser;
  target: UserRecord;
  isActive: boolean;
}): Promise<{ user: UserRecord; changed: boolean }> {
  const { actor, target, isActive } = input;

  return db.transaction(async (trx) => {
    // The "is_active = opposite" condition makes this safe even if two people click at the same time.
    const updated = await trx('users')
      .where({ id: target.id, is_active: !isActive })
      .update({ is_active: isActive })
      .returning(USER_COLUMNS);

    if (updated.length === 0) {
      const current = await trx('users').select(USER_COLUMNS).where({ id: target.id }).first();
      return { user: current as UserRecord, changed: false };
    }

    if (!isActive) {
      await writeAudit(trx, {
        organizationId: target.organization_id as number,
        targetUserId: target.id,
        actorId: actor.id,
        action: 'USER_DEACTIVATED',
        oldValue: { is_active: true },
        newValue: { is_active: false },
      });
    }

    return { user: updated[0] as UserRecord, changed: true };
  });
}