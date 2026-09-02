import { env, pipeline } from "@huggingface/transformers";
// Import runtime assets from the installed package so ONNX never falls back to
// remotely hosted executable code. The package export map intentionally does
// not expose these generated runtime files as deep imports.
import wasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url";
import wasmMjsUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url";

env.allowRemoteModels = true;
env.allowLocalModels = false;
if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmMjsUrl };

type Profile = { model: string; device: "webgpu" | "wasm" };
type Request = { type: "warm" | "transcribe"; id: number; audio?: Float32Array; primary: Profile; fallback: Profile };
let engine: any;
let profile: Profile | undefined;
let loading: Promise<void> | undefined;

function details(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

async function load(next: Profile, id: number): Promise<void> {
  if (engine && profile?.model === next.model && profile.device === next.device) return;
  if (loading) return loading;
  loading = (async () => {
    engine = await pipeline("automatic-speech-recognition", next.model, {
      device: next.device,
      progress_callback: (event: { progress?: number; status?: string; file?: string }) => {
        self.postMessage({ type: "progress", id, progress: event.progress, detail: event.status ?? event.file });
      },
    });
    profile = next;
  })();
  try { await loading; } finally { loading = undefined; }
}

self.onmessage = async ({ data }: MessageEvent<Request>) => {
  let webGpuFailure: unknown;
  try {
    if ((navigator as Navigator & { gpu?: unknown }).gpu) {
      try { await load(data.primary, data.id); }
      catch (error) {
        webGpuFailure = error;
        console.warn("[Prompt Pilot Mobile] WebGPU Whisper unavailable; using WASM.", error);
        engine = undefined; profile = undefined; loading = undefined;
      }
    }
    if (!engine) {
      try { await load(data.fallback, data.id); }
      catch (error) {
        console.error("[Prompt Pilot Mobile] Whisper WASM initialization failed", error);
        throw new Error(`No local Whisper backend could start. WebGPU: ${webGpuFailure ? details(webGpuFailure) : "unavailable"}. WASM: ${details(error)}`);
      }
    }
    if (data.type === "warm") { self.postMessage({ type: "result", id: data.id, text: "" }); return; }
    if (!data.audio?.length) throw new Error("No audio samples were available.");
    const result = await engine(data.audio, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: false });
    self.postMessage({ type: "result", id: data.id, text: typeof result?.text === "string" ? result.text.trim() : "" });
  } catch (error) {
    console.error("[Prompt Pilot Mobile] Whisper transcription failed", error);
    self.postMessage({ type: "error", id: data.id, message: details(error) });
  }
};
