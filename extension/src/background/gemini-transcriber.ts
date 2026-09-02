import { GEMINI_ENDPOINT } from "../shared/config";
import { RefinerError } from "../shared/errors";

interface TextBlock { type?: string; text?: string; content?: TextBlock[] | string; summary?: TextBlock[] | string }
interface ResponseBody { output_text?: string; output?: TextBlock[]; outputs?: TextBlock[]; steps?: TextBlock[]; status?: string; errors?: Array<{ message?: string }> }

function readText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(readText);
  if (!value || typeof value !== "object") return [];
  const block = value as TextBlock;
  if (typeof block.text === "string") return [block.text];
  return block.content !== undefined ? readText(block.content) : block.summary !== undefined ? readText(block.summary) : [];
}

function extractText(body: ResponseBody): string {
  if (body.output_text?.trim()) return body.output_text.trim();
  const modelSteps = (body.steps ?? []).filter((step) => step.type === "model_output");
  return (readText(modelSteps.length ? modelSteps : body.steps ?? []).join("") || readText(body.outputs ?? body.output ?? []).join("")).trim();
}

export class GeminiTranscriber {
  constructor(private readonly getApiKey: () => Promise<string | undefined>) {}

  async transcribe(audio: ArrayBuffer, mimeType: string): Promise<string> {
    const key = (await this.getApiKey())?.trim();
    if (!key) throw new RefinerError("missing-key", "Add your Gemini API key in Prompt Pilot settings before using cloud transcription.");
    const blob = new Blob([audio], { type: mimeType || "audio/webm" });
    let file: { name?: string; uri?: string; mimeType?: string };
    try {
      const start = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
        method: "POST",
        headers: {
          "x-goog-api-key": key,
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(blob.size),
          "X-Goog-Upload-Header-Content-Type": blob.type,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: "prompt-pilot-recording" } }),
      });
      if (start.status === 401 || start.status === 403) throw new RefinerError("invalid-key", "Gemini rejected this API key. Check Prompt Pilot settings.");
      if (start.status === 429) throw new RefinerError("rate-limit", "Gemini's free-tier limit was reached. Try again later.");
      if (!start.ok) throw new RefinerError("api-error", `Gemini audio upload failed (HTTP ${start.status}).`);
      const uploadUrl = start.headers.get("x-goog-upload-url");
      if (!uploadUrl) throw new RefinerError("api-error", "Gemini did not return an upload URL.");
      const upload = await fetch(uploadUrl, { method: "POST", headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "Content-Type": blob.type }, body: blob });
      if (upload.status === 401 || upload.status === 403) throw new RefinerError("invalid-key", "Gemini rejected this API key. Check Prompt Pilot settings.");
      if (upload.status === 429) throw new RefinerError("rate-limit", "Gemini's free-tier limit was reached. Try again later.");
      if (!upload.ok) throw new RefinerError("api-error", `Gemini audio upload failed (HTTP ${upload.status}).`);
      const uploaded = await upload.json() as { file?: { name?: string; uri?: string; mimeType?: string }; uri?: string; name?: string; mimeType?: string };
      file = uploaded.file ?? uploaded;
    } catch (error) {
      if (error instanceof RefinerError) throw error;
      throw new RefinerError("offline", "Cloud transcription could not be reached. Your recording remains local.");
    }
    if (!file.uri) throw new RefinerError("api-error", "Gemini did not return an audio file reference.");
    try {
      const response = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ model: "gemini-3.5-transcribe", input: [{ type: "audio", uri: file.uri, mime_type: file.mimeType || blob.type }], generation_config: { transcription_config: { mode: "verbatim", language_codes: ["en-US"] } }, store: false }),
      });
      if (response.status === 401 || response.status === 403) throw new RefinerError("invalid-key", "Gemini rejected this API key. Check Prompt Pilot settings.");
      if (response.status === 429) throw new RefinerError("rate-limit", "Gemini's free-tier limit was reached. Try again later.");
      if (!response.ok) throw new RefinerError("api-error", `Gemini transcription failed (HTTP ${response.status}).`);
      const text = extractText(await response.json() as ResponseBody);
      if (!text) throw new RefinerError("api-error", "Gemini returned no transcript.");
      return text;
    } finally {
      if (file.name) void fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, { method: "DELETE", headers: { "x-goog-api-key": key } }).catch(() => undefined);
    }
  }
}
