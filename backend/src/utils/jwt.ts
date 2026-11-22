import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './AppError';

// The token only carries the user's id (inside the standard "sub" field).
// It deliberately does NOT carry the role or the organization: those are always read from the
// database on every request, so a client can never fake them and changes apply immediately.

export function signToken(userId: number): string {
  const options: SignOptions = {
    subject: String(userId),
    expiresIn: env.jwt.expiresIn as SignOptions['expiresIn'],
    algorithm: 'HS256',
  };
  return jwt.sign({}, env.jwt.secret, options);
}

// Check the token's signature and expiry. Returns the user id, or throws a 401 AppError.
export function verifyToken(token: string): number {
  try {
    const payload = jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] });
    const userId = typeof payload === 'object' ? Number(payload.sub) : NaN;
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError(401, 'INVALID_TOKEN', 'The login token is not valid.');
    }
    return userId;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Your login has expired. Please log in again.');
    }
    throw new AppError(401, 'INVALID_TOKEN', 'The login token is not valid.');
  }
}