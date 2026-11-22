import dotenv from 'dotenv';

// Read the .env file (if it exists) and put its values into process.env
dotenv.config({ quiet: true });

// Read one variable. Stop the program with a clear message if it is missing.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing environment variable: ${name}. Check your backend/.env file (see .env.example).`
    );
  }
  return value.trim();
}

// Read a number variable (for example PORT). Stop with a clear message if it is not a number.
function requireNumberEnv(name: string): number {
  const raw = requireEnv(name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive whole number, but got "${raw}".`);
  }
  return value;
}

// The secret used to sign login tokens. A short secret can be guessed, so we insist on a long one.
function requireJwtSecret(): string {
  const secret = requireEnv('JWT_SECRET');
  if (secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters long. Generate one with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return secret;
}

export const env = {
  nodeEnv: process.env.NODE_ENV?.trim() || 'development',
  port: requireNumberEnv('PORT'),
  db: {
    host: requireEnv('DB_HOST'),
    port: requireNumberEnv('DB_PORT'),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    database: requireEnv('DB_NAME'),
  },
  jwt: {
    secret: requireJwtSecret(),
    expiresIn: requireEnv('JWT_EXPIRES_IN'),
  },
  corsOrigin: requireEnv('CORS_ORIGIN'),
};