import { LOCAL_TRANSCRIPTION_TIMEOUT_MS, WHISPER_PROFILES } from "../shared/config";

let worker: Worker | undefined;
let requestId = 0;
let warmRequested = false;
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./transcriber.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<{ type: string; id: number; operationId?: string; text?: string; message?: string; progress?: number; detail?: string }>) => {
    const message = event.data;
    if (message.type === "progress") {
      void chrome.runtime.sendMessage({ type: "ENGINE_PROGRESS", operationId: message.operationId, progress: message.progress, detail: message.detail }).catch(() => undefined);
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.type === "result") request.resolve(message.text ?? "");
    else request.reject(new Error(message.message ?? "Whisper failed."));
  };
  worker.onerror = (event) => {
    // Keep the complete worker failure visible during development. A generic
    // replacement here would hide the actual ONNX/CSP/module-load diagnosis.
    console.error("[Prompt Pilot] Whisper worker crashed", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    });
    for (const request of pending.values()) request.reject(new Error("Whisper worker stopped unexpectedly."));
    pending.clear();
    worker = undefined;
    warmRequested = false;
  };
  return worker;
}

export async function transcribe(audio: Float32Array, operationId: string): Promise<string> {
  const id = ++requestId;
  const activeWorker = ensureWorker();
  return new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      const error = new Error(`Local Whisper timed out after ${Math.round(LOCAL_TRANSCRIPTION_TIMEOUT_MS / 1000)} seconds.`);
      console.error("[Prompt Pilot] Local Whisper request timed out", { operationId, timeoutMs: LOCAL_TRANSCRIPTION_TIMEOUT_MS });
      activeWorker.terminate();
      worker = undefined;
      warmRequested = false;
      for (const request of pending.values()) request.reject(error);
      pending.clear();
      reject(error);
    }, LOCAL_TRANSCRIPTION_TIMEOUT_MS);
    const finish = (fn: (value: string) => void) => (value: string) => { window.clearTimeout(timeout); fn(value); };
    pending.set(id, { resolve: finish(resolve), reject: (error) => { window.clearTimeout(timeout); reject(error); } });
    try {
      activeWorker.postMessage({
        type: "transcribe",
        id,
        operationId,
        audio,
        primary: WHISPER_PROFILES.primary,
        fallback: WHISPER_PROFILES.fallback,
      }, [audio.buffer]);
    } catch (error) {
      window.clearTimeout(timeout);
      pending.delete(id);
      reject(error instanceof Error ? error : new Error("Whisper worker request failed."));
    }
  });
}

export function warmup(operationId: string): void {
  if (warmRequested) return;
  warmRequested = true;
  ensureWorker().postMessage({
    type: "warm",
    id: 0,
    operationId,
    primary: WHISPER_PROFILES.primary,
    fallback: WHISPER_PROFILES.fallback,
  });
}
