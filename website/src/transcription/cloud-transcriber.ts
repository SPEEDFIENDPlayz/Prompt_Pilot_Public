import { GEMINI_ENDPOINT } from "../core/config";
import { RefinerError } from "../core/errors";
import { extractGeminiText } from "../core/gemini-refiner";
import type { TranscriptionProgress, TranscriptionResult } from "../core/types";

const TRANSCRIBE_MODEL = "gemini-3.5-transcribe";
const UPLOAD_ENDPOINT = "https://generativelanguage.googleapis.com/upload/v1beta/files";

interface UploadedFile { name?: string; uri?: string; mimeType?: string }

export class GeminiTranscriber {
  constructor(private readonly getApiKey: () => Promise<string | undefined>) {}

  async transcribe(audio: Blob, onProgress?: (progress: TranscriptionProgress) => void): Promise<TranscriptionResult> {
    const key = (await this.getApiKey())?.trim();
    if (!key) throw new RefinerError("missing-key", "Add your Gemini API key in Settings.");
    onProgress?.({ detail: "Uploading audio for transcription" });
    const mimeType = audio.type || "audio/webm";
    let file: UploadedFile;
    try {
      // The Files API uses a resumable two-request upload. Keeping the bytes
      // in memory avoids writing recordings to disk or introducing a server.
      const start = await fetch(UPLOAD_ENDPOINT, {
        method: "POST",
        headers: {
          "x-goog-api-key": key,
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(audio.size),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: "prompt-pilot-recording" } }),
      });
      if (start.status === 401 || start.status === 403) throw new RefinerError("invalid-key", "Gemini rejected this API key. Check it in Settings.");
      if (start.status === 429) throw new RefinerError("rate-limit", "Gemini's free-tier limit was reached. Try again later.");
      if (!start.ok) throw new RefinerError("api-error", `Gemini audio upload failed (HTTP ${start.status}).`);
      const uploadUrl = start.headers.get("x-goog-upload-url");
      if (!uploadUrl) throw new RefinerError("api-error", "Gemini did not return an upload URL.");
      const upload = await fetch(uploadUrl, {
        method: "POST",
        headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "Content-Type": mimeType },
        body: audio,
      });
      if (upload.status === 401 || upload.status === 403) throw new RefinerError("invalid-key", "Gemini rejected this API key. Check it in Settings.");
      if (upload.status === 429) throw new RefinerError("rate-limit", "Gemini's free-tier limit was reached. Try again later.");
      if (!upload.ok) throw new RefinerError("api-error", `Gemini audio upload failed (HTTP ${upload.status}).`);
      const uploaded = await upload.json() as { file?: UploadedFile; uri?: string; name?: string; mimeType?: string };
      file = uploaded.file ?? uploaded;
    } catch (error) {
      if (error instanceof RefinerError) throw error;
      throw new RefinerError("offline", "Cloud transcription could not be reached. Try again or switch to Local only.");
    }
    if (!file.uri) throw new RefinerError("api-error", "Gemini did not return an audio file reference.");
    onProgress?.({ detail: "Transcribing audio in the cloud" });
    try {
      const response = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model: TRANSCRIBE_MODEL,
          input: [{ type: "audio", uri: file.uri, mime_type: file.mimeType || mimeType }],
          generation_config: { transcription_config: { mode: "verbatim", language_codes: ["en-US"] } },
          store: false,
        }),
      });
      if (response.status === 401 || response.status === 403) throw new RefinerError("invalid-key", "Gemini rejected this API key. Check it in Settings.");
      if (response.status === 429) throw new RefinerError("rate-limit", "Gemini's free-tier limit was reached. Your recording is still available to retry.");
      if (!response.ok) throw new RefinerError("api-error", `Gemini transcription failed (HTTP ${response.status}).`);
      const body = await response.json() as Parameters<typeof extractGeminiText>[0];
      const text = extractGeminiText(body);
      if (!text) throw new RefinerError("api-error", "Gemini returned no transcript. Try recording again.");
      return { text, provider: "gemini-transcribe" };
    } catch (error) {
      if (error instanceof RefinerError) throw error;
      throw new RefinerError("offline", "Cloud transcription could not be completed. Try again.");
    } finally {
      if (file.name) {
        void fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, { method: "DELETE", headers: { "x-goog-api-key": key } }).catch(() => undefined);
      }
    }
  }
}
