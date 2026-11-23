import { AppError } from './AppError';

// A list of problems found in the input, one message per field name.
export type FieldIssues = Record<string, string>;

// Build the standard "400 validation error" response. The details tell the user exactly what to fix.
export function validationError(fields: FieldIssues): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'The request contains invalid data.', { fields });
}

// If any problems were collected, stop and report all of them at once.
export function throwIfIssues(fields: FieldIssues): void {
  if (Object.keys(fields).length > 0) {
    throw validationError(fields);
  }
}

// Make sure the request body is a JSON object (not empty, not a list, not a plain string).
export function readBodyObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw validationError({ body: 'A JSON object is required in the request body.' });
  }
  return body as Record<string, unknown>;
}

// Read a required text field. If it is wrong, record the problem in `issues` and return undefined.
export function readRequiredString(
  source: Record<string, unknown>,
  field: string,
  issues: FieldIssues,
  options: { maxLength?: number } = {}
): string | undefined {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    issues[field] = `${field} is required and must be a non-empty text.`;
    return undefined;
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    issues[field] = `${field} must be at most ${options.maxLength} characters long.`;
    return undefined;
  }
  return value;
}

// Read a required email address. Returns it trimmed and in lower case.
export function readEmail(source: Record<string, unknown>, field: string, issues: FieldIssues): string | undefined {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    issues[field] = `${field} is required and must be an email address.`;
    return undefined;
  }
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    issues[field] = `${field} must be a valid email address.`;
    return undefined;
  }
  return email;
}

// Read a required new password (8 to 128 characters). It is NOT trimmed: spaces count.
export function readPassword(source: Record<string, unknown>, field: string, issues: FieldIssues): string | undefined {
  const value = source[field];
  if (typeof value !== 'string') {
    issues[field] = `${field} is required and must be a text.`;
    return undefined;
  }
  if (value.length < 8 || value.length > 128) {
    issues[field] = `${field} must be between 8 and 128 characters long.`;
    return undefined;
  }
  return value;
}

// Read a required true/false field.
export function readBoolean(source: Record<string, unknown>, field: string, issues: FieldIssues): boolean | undefined {
  const value = source[field];
  if (typeof value !== 'boolean') {
    issues[field] = `${field} is required and must be true or false.`;
    return undefined;
  }
  return value;
}

// Read an id from the URL (for example /users/12). Must be a positive whole number.
export function parseIdParam(value: unknown, field: string): number {
  if (typeof value !== 'string' || !/^[0-9]{1,15}$/.test(value) || Number(value) <= 0) {
    throw validationError({ [field]: `${field} must be a positive whole number.` });
  }
  return Number(value);
}

// Read a text field that must be one of a fixed list (for example priority).
// When `required` is false, an empty or missing value is fine and returns undefined.
export function readEnum<T extends string>(
  source: Record<string, unknown>,
  field: string,
  issues: FieldIssues,
  allowed: readonly T[],
  required = true
): T | undefined {
  const value = source[field];
  if (value === undefined || value === null || value === '') {
    if (required) {
      issues[field] = `${field} is required and must be one of: ${allowed.join(', ')}.`;
    }
    return undefined;
  }
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    issues[field] = `${field} must be one of: ${allowed.join(', ')}.`;
    return undefined;
  }
  return value as T;
}

// Read a positive whole number (a JSON number, or digits inside a text such as a query string value).
export function readPositiveInt(
  source: Record<string, unknown>,
  field: string,
  issues: FieldIssues,
  options: { required?: boolean; max?: number } = {}
): number | undefined {
  const { required = true, max } = options;
  const value = source[field];
  if (value === undefined || value === null || value === '') {
    if (required) {
      issues[field] = `${field} is required and must be a positive whole number.`;
    }
    return undefined;
  }
  const number =
    typeof value === 'number' ? value : typeof value === 'string' && /^[0-9]{1,15}$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(number) || number <= 0) {
    issues[field] = `${field} must be a positive whole number.`;
    return undefined;
  }
  if (max !== undefined && number > max) {
    issues[field] = `${field} must be at most ${max}.`;
    return undefined;
  }
  return number;
}

// Read a date and time such as 2026-12-01T09:00:00Z or 2026-12-01T14:30:00+05:30.
// A time zone (Z or +hh:mm) is REQUIRED, so there is never any doubt about the exact moment.
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function readDateTime(
  source: Record<string, unknown>,
  field: string,
  issues: FieldIssues,
  required = true
): Date | undefined {
  const value = source[field];
  if (value === undefined || value === null || value === '') {
    if (required) {
      issues[field] = `${field} is required and must be a date and time like 2026-12-01T09:00:00Z.`;
    }
    return undefined;
  }

  const match = typeof value === 'string' ? DATE_TIME_PATTERN.exec(value) : null;
  if (!match) {
    issues[field] = `${field} must be a date and time with a time zone, like 2026-12-01T09:00:00Z or 2026-12-01T14:30:00+05:30.`;
    return undefined;
  }

  // JavaScript silently turns 31 February into 3 March, so check that the calendar date really exists.
  const [, year, month, day, hour, minute] = match;
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const realDate =
    calendar.getUTCFullYear() === Number(year) &&
    calendar.getUTCMonth() === Number(month) - 1 &&
    calendar.getUTCDate() === Number(day);
  const date = new Date(value as string);
  if (!realDate || Number(hour) > 23 || Number(minute) > 59 || Number.isNaN(date.getTime())) {
    issues[field] = `${field} is not a real date and time.`;
    return undefined;
  }
  return date;
}