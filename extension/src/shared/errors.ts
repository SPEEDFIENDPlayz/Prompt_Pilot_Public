export type RefinerErrorCode =
  | "missing-key"
  | "missing-groq-key"
  | "invalid-key"
  | "invalid-groq-key"
  | "rate-limit"
  | "offline"
  | "api-error"
  | "chat-context-unavailable"
  | "chat-context-failed"
  | "local-transcription-timeout";

export class RefinerError extends Error {
  constructor(public readonly code: RefinerErrorCode, message: string) {
    super(message);
    this.name = "RefinerError";
  }
}
