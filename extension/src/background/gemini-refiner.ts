import { GEMINI_ENDPOINT, GEMINI_MODEL, type ProcessingLevel } from "../shared/config";
import { PROCESSING_MODES } from "../shared/processing-modes";
import { RefinerError } from "../shared/errors";

export interface PromptRefiner {
  refine(transcript: string, level: ProcessingLevel): Promise<string>;
}

interface GeminiTextBlock {
  type?: string;
  text?: string;
  content?: GeminiTextBlock[] | string;
  summary?: GeminiTextBlock[] | string;
}

interface GeminiResponse {
  output_text?: string;
  output?: GeminiTextBlock[];
  outputs?: GeminiTextBlock[];
  steps?: GeminiTextBlock[];
  status?: string;
  errors?: Array<{ code?: string; message?: string }>;
}

function readTextBlocks(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => readTextBlocks(item));
  if (!value || typeof value !== "object") return [];
  const block = value as GeminiTextBlock;
  if (typeof block.text === "string") return [block.text];
  if (block.content !== undefined) return readTextBlocks(block.content);
  if (block.summary !== undefined) return readTextBlocks(block.summary);
  return [];
}

function extractText(body: GeminiResponse): string {
  if (typeof body.output_text === "string" && body.output_text.trim()) return body.output_text.trim();

  // Current Interactions REST responses return model output in steps. The
  // legacy API used outputs, while a few SDK versions exposed output.
  const modelSteps = (body.steps ?? []).filter((step) => step.type === "model_output");
  const stepText = readTextBlocks(modelSteps.length ? modelSteps : body.steps ?? []);
  if (stepText.length) return stepText.join("").trim();
  return readTextBlocks(body.outputs ?? body.output ?? []).join("").trim();
}

function describeResponseShape(body: GeminiResponse): Record<string, unknown> {
  return {
    status: body.status,
    keys: Object.keys(body),
    outputText: typeof body.output_text === "string",
    outputCount: Array.isArray(body.output) ? body.output.length : 0,
    outputsCount: Array.isArray(body.outputs) ? body.outputs.length : 0,
    steps: Array.isArray(body.steps) ? body.steps.map((step) => step.type ?? "unknown") : [],
  };
}

export class GeminiRefiner implements PromptRefiner {
  constructor(private readonly getApiKey: () => Promise<string | undefined>) {}

  async refine(transcript: string, level: ProcessingLevel): Promise<string> {
    const apiKey = (await this.getApiKey())?.trim();
    if (!apiKey) throw new RefinerError("missing-key", "Add your Gemini API key in Prompt Pilot settings.");
    if (!transcript.trim()) throw new RefinerError("api-error", "Whisper returned an empty transcript.");

    let response: Response;
    try {
      response = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
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

    if (response.status === 401 || response.status === 403) {
      throw new RefinerError("invalid-key", "Gemini rejected the API key. Check it in Prompt Pilot settings.");
    }
    if (response.status === 429) {
      throw new RefinerError("rate-limit", "Gemini's free-tier limit was reached. Your raw transcript is still available.");
    }
    if (!response.ok) {
      throw new RefinerError("api-error", `Gemini returned HTTP ${response.status}. Your raw transcript is still available.`);
    }

    let body: GeminiResponse;
    try {
      body = (await response.json()) as GeminiResponse;
    } catch {
      throw new RefinerError("api-error", "Gemini returned an unreadable response. Your raw transcript is still available.");
    }
    if (import.meta.env.DEV) console.debug("[Prompt Pilot] Gemini response shape", describeResponseShape(body));
    if (body.status === "failed" || body.status === "cancelled") {
      const providerMessage = body.errors?.find((error) => typeof error.message === "string")?.message;
      throw new RefinerError("api-error", providerMessage ? `Gemini failed: ${providerMessage}` : `Gemini interaction ${body.status}. Your raw transcript is still available.`);
    }
    const text = extractText(body);
    if (!text) throw new RefinerError("api-error", "Gemini returned no refined text. Your raw transcript is still available.");
    return text;
  }
}
