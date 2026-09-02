import { describe, expect, it, vi, afterEach } from "vitest";
import { GeminiRefiner } from "../../src/background/gemini-refiner";

afterEach(() => vi.unstubAllGlobals());

describe("GeminiRefiner", () => {
  it("sends only the transcript and selected system instruction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: "Clean prompt" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new GeminiRefiner(async () => "secret-key").refine("um please fix this", 2);
    expect(result).toBe("Clean prompt");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.input).toBe("um please fix this");
    expect(request).not.toHaveProperty("audio");
    expect(request.store).toBe(false);
    expect(fetchMock.mock.calls[0][1].headers["x-goog-api-key"]).toBe("secret-key");
  });

  it("extracts text from the current Interactions steps schema", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "text", text: "Refined from steps" }] }],
    }), { status: 200 })));
    await expect(new GeminiRefiner(async () => "key").refine("raw", 2)).resolves.toBe("Refined from steps");
  });

  it("extracts text from the legacy outputs schema", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed",
      outputs: [{ type: "text", text: "Refined from outputs" }],
    }), { status: 200 })));
    await expect(new GeminiRefiner(async () => "key").refine("raw", 2)).resolves.toBe("Refined from outputs");
  });

  it("classifies rate limits without losing the fallback path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("limit", { status: 429 })));
    await expect(new GeminiRefiner(async () => "key").refine("raw", 1)).rejects.toMatchObject({ code: "rate-limit" });
  });

  it("requires a configured key", async () => {
    await expect(new GeminiRefiner(async () => undefined).refine("raw", 1)).rejects.toMatchObject({ code: "missing-key" });
  });
});
