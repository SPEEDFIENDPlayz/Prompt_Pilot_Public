import { AUDIO_CAPTURE_PROFILES } from "../core/config";

type CaptureProfile = typeof AUDIO_CAPTURE_PROFILES.capable | typeof AUDIO_CAPTURE_PROFILES.constrained;

export class MobileRecorder {
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  get mediaStream(): MediaStream | undefined { return this.stream; }

  async start(profile: CaptureProfile = AUDIO_CAPTURE_PROFILES.capable): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("This browser does not support microphone recording.");
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
      channelCount: profile.channelCount,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    } });
    const mimeType = profile.mimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType, audioBitsPerSecond: profile.audioBitsPerSecond } : { audioBitsPerSecond: profile.audioBitsPerSecond });
    this.chunks = [];
    this.recorder.ondataavailable = (event) => { if (event.data.size) this.chunks.push(event.data); };
    this.recorder.start();
  }

  async stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("No recording is active.");
    await new Promise<void>((resolve, reject) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.addEventListener("error", () => reject(new Error("Recording failed.")), { once: true });
      recorder.stop();
    });
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.recorder = undefined;
    return new Blob(this.chunks, { type: recorder.mimeType || "audio/mp4" });
  }

  cancel(): void {
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.recorder = undefined;
    this.chunks = [];
  }
}
