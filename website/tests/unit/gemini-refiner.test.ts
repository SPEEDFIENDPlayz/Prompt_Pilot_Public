import { describe, expect, it } from "vitest";
import { extractGeminiText, GeminiRefiner } from "../../src/core/gemini-refiner";

describe("Gemini response parsing", () => {
  it("reads current step content", () => {
    expect(extractGeminiText({ steps: [{ type: "model_output", content: [{ text: "Refined prompt" }] }] })).toBe("Refined prompt");
  });
  it("reads legacy output text", () => expect(extractGeminiText({ output_text: "Direct text" })).toBe("Direct text"));
  it("reads compatibility outputs", () => expect(extractGeminiText({ outputs: [{ text: "Legacy" }] })).toBe("Legacy"));

  it("sends only the raw transcript with the selected mode instruction", async () => {
    const originalFetch = globalThis.fetch;
    let sent: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ output_text: "Refined" }), { status: 200 });
    }) as typeof fetch;
    try {
      await expect(new GeminiRefiner(async () => "test-key").refine("raw voice transcript", 2)).resolves.toBe("Refined");
      expect(sent).toMatchObject({ input: "raw voice transcript", store: false });
      expect(JSON.stringify(sent)).not.toContain("audio");
    } finally { globalThis.fetch = originalFetch; }
  });
});
