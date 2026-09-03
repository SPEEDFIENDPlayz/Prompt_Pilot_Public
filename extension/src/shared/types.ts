import type { ProcessingLevel } from "./config";
import type { DeviceClass, TranscriptionMode } from "./device-capabilities";

export type PromptPilotState =
  | "idle"
  | "permission-needed"
  | "recording"
  | "transcribing"
  | "refining"
  | "clarifying"
  | "inserted"
  | "error";

export interface OperationResult {
  operationId: string;
  raw: string;
  refined?: string;
  error?: { code: string; message: string };
}

export type ClientMessage =
  | { type: "TOGGLE_RECORDING"; level: ProcessingLevel; transcriptionMode?: TranscriptionMode; deviceClass?: DeviceClass; includeChatContext?: boolean; chatContextExport?: string }
  | { type: "GET_SHORTCUT" }
  | { type: "OPEN_OPTIONS" }
  | { type: "GET_PROCESSING_LEVEL" }
  | { type: "GET_TRANSCRIPTION_MODE" }
  | { type: "SET_TRANSCRIPTION_MODE"; mode: TranscriptionMode }
  | { type: "SET_PROCESSING_LEVEL"; level: ProcessingLevel }
  | { type: "GET_GROQ_KEY_STATUS" }
  | { type: "REFINE_TRANSCRIPT"; operationId: string; level: ProcessingLevel; raw: string; contextExport?: string; includeChatContext?: boolean }
  | { type: "CLARIFY_PROMPT"; operationId: string; prompt: string }
  | { type: "GET_PENDING_RESULT" }
  | { type: "CLEAR_PENDING_RESULT" };

export type EngineMessage =
  | { type: "ENGINE_START"; operationId: string; useCloud?: boolean; allowCloudFallback?: boolean; captureProfile?: "capable" | "constrained" }
  | { type: "ENGINE_STOP"; operationId: string }
  | { type: "ENGINE_AUDIO"; operationId: string; audio: ArrayBuffer; mimeType: string; fallback?: boolean }
  | { type: "ENGINE_READY" }
  | { type: "ENGINE_ERROR"; operationId: string; code: string; message: string };

export type ProgressMessage =
  | { type: "STATE"; operationId: string; state: PromptPilotState; detail?: string }
  | { type: "RAW_TRANSCRIPT"; operationId: string; raw: string }
  | { type: "RESULT"; operationId: string; raw: string; refined: string }
  | { type: "RESULT_ERROR"; operationId: string; raw: string; code: string; message: string }
  | { type: "CLARIFIED_RESULT"; operationId: string; clarified: string }
  | { type: "CLARIFY_ERROR"; operationId: string; code: string; message: string };
