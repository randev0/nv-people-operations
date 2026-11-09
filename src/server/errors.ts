export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message = "Malformed request.", fieldErrors?: FieldErrors) =>
  new AppError(400, fieldErrors ? "VALIDATION_FAILED" : "BAD_REQUEST", message, fieldErrors);
export const unauthenticated = () => new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
export const forbidden = (message = "You are not allowed to perform this action.") =>
  new AppError(403, "FORBIDDEN", message);
export const notFound = (what = "Record") => new AppError(404, "NOT_FOUND", `${what} not found.`);
export const staleVersion = () =>
  new AppError(409, "STALE_VERSION", "This record was changed by someone else. Refresh and try again.");
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const domainError = (code: string, message: string, fieldErrors?: FieldErrors) =>
  new AppError(422, code, message, fieldErrors);
export const rateLimited = () => new AppError(429, "RATE_LIMITED", "Too many attempts. Please wait and try again.");
export const aiUnavailable = (message = "AI suggestions are unavailable right now. You can still submit manually.") =>
  new AppError(503, "AI_UNAVAILABLE", message);
export const aiInvalidOutput = () =>
  new AppError(503, "AI_INVALID_OUTPUT", "The AI returned an unusable suggestion. You can still submit manually.");
