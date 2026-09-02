import type { ProcessingLevel } from "./types";

export const DEFAULT_LEVEL: ProcessingLevel = 2;
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

export const MOBILE_WHISPER_PROFILES = {
  primary: { model: "onnx-community/whisper-tiny.en", device: "webgpu" as const },
  fallback: { model: "onnx-community/whisper-tiny.en", device: "wasm" as const },
};
