import { transcribe } from "./whisper-transcriber";

const CHUNK_SECONDS = 8;
const OVERLAP_SECONDS = 1;

function mergeText(existing: string, next: string): string {
  const left = existing.trim();
  const right = next.trim();
  if (!left) return right;
  if (!right) return left;
  const a = left.split(/\s+/);
  const b = right.split(/\s+/);
  const max = Math.min(12, a.length, b.length);
  for (let count = max; count >= 1; count -= 1) {
    if (a.slice(-count).join(" ").toLowerCase() === b.slice(0, count).join(" ").toLowerCase()) {
      return `${left} ${b.slice(count).join(" ")}`.trim();
    }
  }
  return `${left} ${right}`.trim();
}

function resample(samples: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === 16000) return samples;
  const length = Math.max(1, Math.round(samples.length * 16000 / sourceRate));
  const output = new Float32Array(length);
  const ratio = sourceRate / 16000;
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;
    output[index] = samples[left] * (1 - weight) + samples[right] * weight;
  }
  return output;
}

/** Best-effort background chunking. The final Blob remains the authoritative fallback. */
export class BufferedWhisperSession {
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private node?: AudioWorkletNode;
  private gain?: GainNode;
  private samples: number[] = [];
  private processed = 0;
  private queue = Promise.resolve();
  private queueDepth = 0;
  private failed = false;
  private text = "";
  private stopping = false;

  constructor(private readonly operationId: string) {}

  async start(stream: MediaStream): Promise<void> {
    this.stopping = false;
    if (!("audioWorklet" in AudioContext.prototype)) throw new Error("AudioWorklet is unavailable.");
    this.context = new AudioContext();
    // A static extension asset avoids data/blob URLs, which MV3 CSP can reject.
    await this.context.audioWorklet.addModule(chrome.runtime.getURL("pcm.worklet.js"));
    this.source = this.context.createMediaStreamSource(stream);
    this.node = new AudioWorkletNode(this.context, "prompt-pilot-pcm");
    this.gain = this.context.createGain();
    this.gain.gain.value = 0;
    this.node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (this.stopping) return;
      for (const sample of event.data) this.samples.push(sample);
      this.scheduleChunks();
    };
    this.source.connect(this.node).connect(this.gain).connect(this.context.destination);
    await this.context.resume();
  }

  private scheduleChunks(): void {
    if (this.stopping) return;
    const rate = this.context?.sampleRate ?? 48000;
    const size = Math.round(rate * CHUNK_SECONDS);
    if (this.samples.length - this.processed < size) return;
    const end = this.processed + size;
    const start = Math.max(0, this.processed - Math.round(rate * OVERLAP_SECONDS));
    const chunk = Float32Array.from(this.samples.slice(start, end));
    this.processed = end;
    // Do not allow slow inference to create an unbounded in-memory backlog.
    // The caller will fall back to one complete post-recording pass.
    if (this.queueDepth >= 2) { this.failed = true; return; }
    this.queueDepth += 1;
    this.queue = this.queue.then(async () => {
      void chrome.runtime.sendMessage({ type: "ENGINE_PROGRESS", operationId: this.operationId, detail: "Transcribing audio in the background…" }).catch(() => undefined);
      const text = await transcribe(resample(chunk, rate), this.operationId);
      this.text = mergeText(this.text, text);
    }).catch((error) => {
      this.failed = true;
      console.warn("[Prompt Pilot] Background Whisper chunk failed; final pass will be used", error);
    }).finally(() => { this.queueDepth -= 1; });
  }

  async stop(): Promise<string> {
    if (this.stopping) return this.failed ? "" : this.text.trim();
    this.stopping = true;
    const rate = this.context?.sampleRate ?? 48000;
    // Detach the worklet before waiting for inference. Otherwise buffered
    // audio events can append new promises after the awaited queue snapshot,
    // causing late progress messages and an operation that never settles.
    this.node && (this.node.port.onmessage = null);
    this.source?.disconnect();
    this.node?.disconnect();
    this.gain?.disconnect();
    // Process any remaining tail, including short speech after the final
    // eight-second chunk. Dropping a sub-1.2s tail can lose the last word.
    if (this.samples.length > this.processed) {
      const start = Math.max(0, this.processed - Math.round(rate * OVERLAP_SECONDS));
      const chunk = Float32Array.from(this.samples.slice(start));
      this.processed = this.samples.length;
      this.queue = this.queue.then(async () => {
        const text = await transcribe(resample(chunk, rate), this.operationId);
        this.text = mergeText(this.text, text);
      }).catch((error) => { this.failed = true; console.warn("[Prompt Pilot] Final background Whisper chunk failed", error); });
    }
    await this.queue;
    if (this.context) await this.context.close();
    this.context = undefined;
    this.source = undefined;
    this.node = undefined;
    this.gain = undefined;
    return this.failed ? "" : this.text.trim();
  }
}
