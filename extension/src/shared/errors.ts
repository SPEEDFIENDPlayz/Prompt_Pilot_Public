export type RefinerErrorCode = "missing-key" | "invalid-key" | "rate-limit" | "offline" | "api-error";

export class RefinerError extends Error {
  constructor(public readonly code: RefinerErrorCode, message: string) {
    super(message);
    this.name = "RefinerError";
  }
}
