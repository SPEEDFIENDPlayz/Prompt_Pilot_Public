import { AUDIO_CAPTURE_PROFILES } from "../shared/config";

type CaptureProfile = typeof AUDIO_CAPTURE_PROFILES.capable | typeof AUDIO_CAPTURE_PROFILES.constrained;

export class MicrophoneRecorder {
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];

  get mediaStream(): MediaStream | undefined { return this.stream; }

  async start(profile: CaptureProfile = AUDIO_CAPTURE_PROFILES.capable): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
      channelCount: profile.channelCount,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    } });
    const mimeType = profile.mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType, audioBitsPerSecond: profile.audioBitsPerSecond } : { audioBitsPerSecond: profile.audioBitsPerSecond });
    this.chunks = [];
    this.recorder.ondataavailable = (event) => {
      if (event.data.size) this.chunks.push(event.data);
    };
    this.recorder.start();
  }

  async stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("No recording is active.");
    const done = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
    });
    recorder.stop();
    await done;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.recorder = undefined;
    return new Blob(this.chunks, { type: recorder.mimeType || "audio/webm" });
  }
}

export async function blobTo16kMono(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const sourceLength = decoded.length;
    const mono = new Float32Array(sourceLength);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const samples = decoded.getChannelData(channel);
      for (let index = 0; index < sourceLength; index++) mono[index] += samples[index] / decoded.numberOfChannels;
    }
    if (decoded.sampleRate === 16000) return mono;
    const targetLength = Math.max(1, Math.round(sourceLength * 16000 / decoded.sampleRate));
    const output = new Float32Array(targetLength);
    const ratio = decoded.sampleRate / 16000;
    for (let index = 0; index < targetLength; index++) {
      const position = index * ratio;
      const left = Math.floor(position);
      const right = Math.min(left + 1, sourceLength - 1);
      const weight = position - left;
      output[index] = mono[left] * (1 - weight) + mono[right] * weight;
    }
    return output;
  } finally {
    await context.close();
  }
}
