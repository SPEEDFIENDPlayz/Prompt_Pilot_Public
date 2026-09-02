export type ProcessingLevel = 1 | 2 | 3;

export type TranscriptionMode = "auto" | "local" | "cloud";
export type DeviceClass = "phone" | "capable-desktop" | "constrained-desktop";

export interface TranscriptionProgress { detail?: string; progress?: number }

export interface TranscriptionRequest {
  audio?: Blob;
  pcm?: Float32Array;
  mimeType?: string;
  deviceClass: DeviceClass;
  mode: TranscriptionMode;
}

export interface TranscriptionResult {
  text: string;
  provider: "local-whisper" | "gemini-transcribe";
}

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
