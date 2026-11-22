// True when PostgreSQL rejected a row because it would break the named UNIQUE rule.
export function isUniqueViolation(error: unknown, constraintName: string): boolean {
  const err = error as { code?: string; constraint?: string };
  return err?.code === '23505' && err?.constraint === constraintName;
}