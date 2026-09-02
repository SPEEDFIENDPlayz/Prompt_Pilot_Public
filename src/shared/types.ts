import type { ProcessingLevel } from "./config";

export type PromptPilotState =
  | "idle"
  | "permission-needed"
  | "recording"
  | "transcribing"
  | "refining"
  | "inserted"
  | "error";

export interface OperationResult {
  operationId: string;
  raw: string;
  refined?: string;
  error?: { code: string; message: string };
}

export type ClientMessage =
  | { type: "TOGGLE_RECORDING"; level: ProcessingLevel }
  | { type: "GET_SHORTCUT" }
  | { type: "OPEN_OPTIONS" }
  | { type: "GET_PROCESSING_LEVEL" }
  | { type: "SET_PROCESSING_LEVEL"; level: ProcessingLevel }
  | { type: "GET_PENDING_RESULT" }
  | { type: "CLEAR_PENDING_RESULT" };

export type EngineMessage =
  | { type: "ENGINE_START"; operationId: string }
  | { type: "ENGINE_STOP"; operationId: string }
  | { type: "ENGINE_READY" }
  | { type: "ENGINE_ERROR"; operationId: string; code: string; message: string };

export type ProgressMessage =
  | { type: "STATE"; operationId: string; state: PromptPilotState; detail?: string }
  | { type: "RAW_TRANSCRIPT"; operationId: string; raw: string }
  | { type: "RESULT"; operationId: string; raw: string; refined: string }
  | { type: "RESULT_ERROR"; operationId: string; raw: string; code: string; message: string };
