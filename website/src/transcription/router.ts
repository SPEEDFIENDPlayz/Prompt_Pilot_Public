import type { DeviceClass, TranscriptionMode, TranscriptionProgress, TranscriptionRequest, TranscriptionResult } from "../core/types";
import { shouldUseCloud } from "../core/device-capabilities";
import { GeminiTranscriber } from "./cloud-transcriber";
import { transcribe } from "./transcriber";

export class TranscriptionRouter {
  private readonly cloud: GeminiTranscriber;
  constructor(getApiKey: () => Promise<string | undefined>) { this.cloud = new GeminiTranscriber(getApiKey); }

  async transcribe(request: TranscriptionRequest, onProgress?: (progress: TranscriptionProgress) => void): Promise<TranscriptionResult> {
    if (shouldUseCloud(request.mode, request.deviceClass)) {
      if (!request.audio) throw new Error("An audio recording is required for cloud transcription.");
      return this.cloud.transcribe(request.audio, onProgress);
    }
    try {
      if (!request.pcm) throw new Error("Audio samples were not available for local transcription.");
      const text = await transcribe(request.pcm, onProgress);
      return { text, provider: "local-whisper" };
    } catch (error) {
      if (request.mode === "auto" && request.audio) {
        onProgress?.({ detail: "Local transcription failed; trying cloud transcription" });
        return this.cloud.transcribe(request.audio, onProgress);
      }
      throw error;
    }
  }
}
