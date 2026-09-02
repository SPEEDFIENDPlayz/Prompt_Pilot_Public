export const OFFSCREEN_PATH = "src/offscreen/offscreen.html";
export const DEFAULT_LEVEL = 2 as const;
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/interactions`;

export const WHISPER_PROFILES = {
  primary: { model: "onnx-community/whisper-base.en", device: "webgpu" as const },
  fallback: { model: "onnx-community/whisper-tiny.en", device: "wasm" as const },
};

export type ProcessingLevel = 1 | 2 | 3;
