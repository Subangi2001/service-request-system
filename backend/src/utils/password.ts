import bcrypt from 'bcryptjs';

// How much work bcrypt does per password. Higher = safer but slower. 10 is the standard default.
const BCRYPT_ROUNDS = 10;

// Turn a plain password into a hash that is safe to store in the database.
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

// Check a plain password against a stored hash. Returns true only if they match.
export async function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}