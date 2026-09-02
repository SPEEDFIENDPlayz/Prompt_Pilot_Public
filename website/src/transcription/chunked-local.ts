import { transcribe } from "./transcriber";

const CHUNK_SECONDS = 8;
const OVERLAP_SECONDS = 1;

export function mergeChunkText(existing: string, next: string): string {
  const left = existing.trim();
  const right = next.trim();
  if (!left) return right;
  if (!right) return left;
  const a = left.split(/\s+/);
  const b = right.split(/\s+/);
  const max = Math.min(12, a.length, b.length);
  for (let count = max; count >= 1; count--) {
    if (a.slice(-count).join(" ").toLowerCase() === b.slice(0, count).join(" ").toLowerCase()) return `${left} ${b.slice(count).join(" ")}`.trim();
  }
  return `${left} ${right}`.trim();
}

function resample(samples: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === 16000) return samples;
  const length = Math.max(1, Math.round(samples.length * 16000 / sourceRate));
  const output = new Float32Array(length);
  const ratio = sourceRate / 16000;
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;
    output[i] = samples[left] * (1 - weight) + samples[right] * weight;
  }
  return output;
}

export class BufferedWhisperSession {
  private context?: AudioContext;
  private node?: AudioWorkletNode;
  private zeroGain?: GainNode;
  private nativeSamples: number[] = [];
  private processed = 0;
  private queued = Promise.resolve();
  private queueDepth = 0;
  private failed = false;
  private text = "";
  private readonly progress?: (detail: string) => void;

  constructor(progress?: (detail: string) => void) { this.progress = progress; }

  async start(stream: MediaStream): Promise<void> {
    if (!("audioWorklet" in AudioContext.prototype)) throw new Error("AudioWorklet is unavailable.");
    this.context = new AudioContext();
    // Keep the worklet as a same-origin static asset. This also works in
    // installed PWAs where data/blob module URLs can be blocked by CSP.
    await this.context.audioWorklet.addModule(new URL("/prompt-pilot-pcm.worklet.js", window.location.origin));
    const source = this.context.createMediaStreamSource(stream);
    this.node = new AudioWorkletNode(this.context, "prompt-pilot-pcm");
    this.zeroGain = this.context.createGain();
    this.zeroGain.gain.value = 0;
    this.node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const data = event.data;
      for (const sample of data) this.nativeSamples.push(sample);
      this.scheduleReadyChunks();
    };
    source.connect(this.node).connect(this.zeroGain).connect(this.context.destination);
    await this.context.resume();
  }

  private scheduleReadyChunks(): void {
    const rate = this.context?.sampleRate ?? 48000;
    const chunkSamples = Math.round(rate * CHUNK_SECONDS);
    if (this.nativeSamples.length - this.processed < chunkSamples) return;
    const end = this.processed + chunkSamples;
    const start = Math.max(0, this.processed - Math.round(rate * OVERLAP_SECONDS));
    const slice = Float32Array.from(this.nativeSamples.slice(start, end));
    this.processed = end;
    // If inference cannot keep up, stop chunking and let the authoritative
    // post-recording pass handle the complete Blob instead of growing memory.
    if (this.queueDepth >= 2) { this.failed = true; return; }
    this.queueDepth += 1;
    this.queued = this.queued.then(async () => {
      this.progress?.("Processing speech in the background");
      const text = await transcribe(resample(slice, rate));
      this.text = mergeChunkText(this.text, text);
    }).catch(() => { this.failed = true; }).finally(() => { this.queueDepth -= 1; });
  }

  async stop(): Promise<string> {
    const rate = this.context?.sampleRate ?? 48000;
    if (this.nativeSamples.length > this.processed + Math.round(rate * 1.2)) {
      const start = Math.max(0, this.processed - Math.round(rate * OVERLAP_SECONDS));
      const slice = Float32Array.from(this.nativeSamples.slice(start));
      this.processed = this.nativeSamples.length;
      this.queued = this.queued.then(async () => {
        const text = await transcribe(resample(slice, rate));
        this.text = mergeChunkText(this.text, text);
      }).catch(() => undefined);
    }
    await this.queued;
    this.node?.disconnect();
    this.zeroGain?.disconnect();
    if (this.context) await this.context.close();
    this.context = undefined;
    return this.failed ? "" : this.text.trim();
  }
}
