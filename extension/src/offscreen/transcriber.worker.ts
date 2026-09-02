import { env, pipeline } from "@huggingface/transformers";
import wasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url";
import wasmMjsUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url";

env.allowRemoteModels = true;
env.allowLocalModels = false;
// Keep the WASM fallback inside the extension package. Transformers.js otherwise
// defaults to a jsDelivr-hosted runtime binary, which is unnecessary network
// access and can be blocked by MV3 extension policies.
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmMjsUrl };
}

type Profile = { model: string; device: "webgpu" | "wasm" };
let transcriber: any;
let loadedProfile: Profile | undefined;
let loadPromise: Promise<void> | undefined;

async function load(profile: Profile, id: number, operationId?: string): Promise<void> {
  if (transcriber && loadedProfile?.model === profile.model && loadedProfile.device === profile.device) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const next = await pipeline("automatic-speech-recognition", profile.model, {
      device: profile.device,
      progress_callback: (event: { progress?: number; status?: string; file?: string }) => {
        self.postMessage({ type: "progress", id, operationId, progress: event.progress, detail: event.status ?? event.file });
      },
    });
    transcriber = next;
    loadedProfile = profile;
  })();
  try {
    await loadPromise;
  } finally {
    loadPromise = undefined;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  try { return JSON.stringify(error); } catch { return String(error); }
}

self.onmessage = async (event: MessageEvent<{ type: string; id: number; operationId?: string; audio?: Float32Array; primary: Profile; fallback: Profile }>) => {
  if (event.data.type !== "transcribe" && event.data.type !== "warm") return;
  const { id, operationId, audio, primary, fallback } = event.data;
  let primaryError: unknown;
  try {
    try {
      if ((navigator as Navigator & { gpu?: unknown }).gpu) await load(primary, id, operationId);
    } catch (error) {
      primaryError = error;
      console.error("[Prompt Pilot] Whisper WebGPU backend initialization failed", error);
      transcriber = undefined;
      loadedProfile = undefined;
      loadPromise = undefined;
    }
    if (!transcriber) {
      try {
        await load(fallback, id, operationId);
      } catch (error) {
        console.error("[Prompt Pilot] Whisper WASM fallback backend initialization failed", error);
        transcriber = undefined;
        loadedProfile = undefined;
        loadPromise = undefined;
        const primaryText = primaryError ? ` WebGPU error: ${describeError(primaryError)}` : "";
        throw new Error(`No local Whisper backend could be initialized.${primaryText} WASM error: ${describeError(error)}`);
      }
    }
    if (event.data.type === "warm") return;
    if (!audio) throw new Error("No audio samples were provided.");
    const result = await transcriber(audio, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: false });
    self.postMessage({ type: "result", id, text: typeof result?.text === "string" ? result.text.trim() : "" });
  } catch (error) {
    console.error("[Prompt Pilot] Whisper transcription failed", error);
    self.postMessage({ type: "error", id, message: error instanceof Error ? error.message : "Local Whisper failed." });
  }
};
