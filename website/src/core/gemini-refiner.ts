import { GEMINI_ENDPOINT, GEMINI_MODEL } from "./config";
import { RefinerError } from "./errors";
import { PROCESSING_MODES } from "./processing-modes";
import type { ProcessingLevel } from "./types";

interface TextBlock { type?: string; text?: string; content?: TextBlock[] | string; summary?: TextBlock[] | string }
export interface GeminiResponse { output_text?: string; output?: TextBlock[]; outputs?: TextBlock[]; steps?: TextBlock[]; status?: string; errors?: Array<{ message?: string }> }

function readText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(readText);
  if (!value || typeof value !== "object") return [];
  const block = value as TextBlock;
  if (typeof block.text === "string") return [block.text];
  return block.content !== undefined ? readText(block.content) : block.summary !== undefined ? readText(block.summary) : [];
}

export function extractGeminiText(body: GeminiResponse): string {
  if (body.output_text?.trim()) return body.output_text.trim();
  const modelSteps = (body.steps ?? []).filter((step) => step.type === "model_output");
  const fromSteps = readText(modelSteps.length ? modelSteps : body.steps ?? []).join("").trim();
  return fromSteps || readText(body.outputs ?? body.output ?? []).join("").trim();
}

export class GeminiRefiner {
  constructor(private readonly getApiKey: () => Promise<string | undefined>) {}

  async refine(transcript: string, level: ProcessingLevel): Promise<string> {
    const key = (await this.getApiKey())?.trim();
    if (!key) throw new RefinerError("missing-key", "Add your Gemini API key to refine this transcript.");
    if (!transcript.trim()) throw new RefinerError("api-error", "No speech detected.");
    let response: Response;
    try {
      response = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model: GEMINI_MODEL,
          system_instruction: PROCESSING_MODES[level].instruction,
          input: transcript,
          store: false,
          generation_config: { thinking_level: "minimal" },
        }),
      });
    } catch {
      throw new RefinerError("offline", "Gemini could not be reached. Your raw transcript is still available.");
    }
    if (response.status === 401 || response.status === 403) throw new RefinerError("invalid-key", "Gemini rejected this API key. Check it in Settings.");
    if (response.status === 429) throw new RefinerError("rate-limit", "Gemini's limit was reached. Your raw transcript is still available.");
    if (!response.ok) throw new RefinerError("api-error", `Gemini returned HTTP ${response.status}. Your raw transcript is still available.`);
    let body: GeminiResponse;
    try { body = await response.json() as GeminiResponse; } catch { throw new RefinerError("api-error", "Gemini returned an unreadable response."); }
    if (body.status === "failed" || body.status === "cancelled") {
      throw new RefinerError("api-error", body.errors?.[0]?.message ?? "Gemini could not refine this transcript.");
    }
    const refined = extractGeminiText(body);
    if (!refined) throw new RefinerError("api-error", "Gemini returned no refined text. Your raw transcript is still available.");
    return refined;
  }
}
