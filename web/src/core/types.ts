export type ProcessingLevel = 1 | 2 | 3;

export type AppPhase = "setup" | "ready" | "recording" | "finalizing" | "transcribing" | "refining" | "result" | "error";

export interface OperationResult {
  rawTranscript: string;
  refinedPrompt: string;
}

export interface Timings {
  recordingFinalizationMs?: number;
  transcriptionMs?: number;
  refinementMs?: number;
}
