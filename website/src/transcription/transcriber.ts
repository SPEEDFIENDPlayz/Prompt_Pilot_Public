import { MOBILE_WHISPER_PROFILES } from "../core/config";

type Progress = { progress?: number; detail?: string };
type WorkerMessage = { type: "progress" | "result" | "error"; id: number; text?: string; message?: string; progress?: number; detail?: string };

let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void; progress?: (event: Progress) => void }>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
    const request = pending.get(data.id);
    if (data.type === "progress") { request?.progress?.({ progress: data.progress, detail: data.detail }); return; }
    if (!request) return;
    pending.delete(data.id);
    if (data.type === "result") request.resolve(data.text ?? "");
    else request.reject(new Error(data.message ?? "Local transcription failed."));
  };
  worker.onerror = (event) => {
    console.error("[Prompt Pilot Mobile] Whisper worker crashed", event.error ?? event.message);
    for (const request of pending.values()) request.reject(new Error("The transcription worker stopped unexpectedly."));
    pending.clear();
    worker = undefined;
  };
  return worker;
}

export async function transcribe(audio: Float32Array, onProgress?: (event: Progress) => void): Promise<string> {
  const id = ++sequence;
  const activeWorker = ensureWorker();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, progress: onProgress });
    activeWorker.postMessage({ type: "transcribe", id, audio, primary: MOBILE_WHISPER_PROFILES.primary, fallback: MOBILE_WHISPER_PROFILES.fallback }, [audio.buffer]);
  });
}

export function warmTranscriber(onProgress?: (event: Progress) => void): void {
  const id = ++sequence;
  const activeWorker = ensureWorker();
  pending.set(id, { resolve: () => undefined, reject: () => undefined, progress: onProgress });
  activeWorker.postMessage({ type: "warm", id, primary: MOBILE_WHISPER_PROFILES.primary, fallback: MOBILE_WHISPER_PROFILES.fallback });
}
