export const OFFSCREEN_PATH = "src/offscreen/offscreen.html";
export const DEFAULT_LEVEL = 2 as const;
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/interactions`;
export const GROQ_MODEL = "openai/gpt-oss-20b";
export const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// Keep chat-context condensation bounded so the final Gemini request stays
// useful even for very long conversations.
export const CHAT_CONTEXT_CHUNK_CHARS = 60_000;
export const CHAT_CONTEXT_BRIEF_CHARS = 6_000;
export const LOCAL_TRANSCRIPTION_TIMEOUT_MS = 180_000;

export const WHISPER_PROFILES = {
  primary: { model: "onnx-community/whisper-base.en", device: "webgpu" as const },
  fallback: { model: "onnx-community/whisper-tiny.en", device: "wasm" as const },
};

export const AUDIO_CAPTURE_PROFILES = {
  capable: { channelCount: 1, audioBitsPerSecond: 56000, mimeTypes: ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"] },
  constrained: { channelCount: 1, audioBitsPerSecond: 28000, mimeTypes: ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"] },
} as const;

export type ProcessingLevel = 1 | 2 | 3;
