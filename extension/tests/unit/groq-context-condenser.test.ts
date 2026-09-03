import { afterEach, describe, expect, it, vi } from "vitest";
import { GroqContextCondenser } from "../../src/background/groq-context-condenser";

afterEach(() => vi.unstubAllGlobals());

describe("GroqContextCondenser", () => {
  it("condenses a structured conversation and uses the configured model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "Goal: fix the TypeScript bug." } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new GroqContextCondenser(async () => "groq-key").condense("USER\nPlease fix this.\n\nASSISTANT\nUse a minimal patch.")).resolves.toBe("Goal: fix the TypeScript bug.");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.model).toBe("openai/gpt-oss-20b");
    expect(request.messages[1].content).toContain("<conversation-reference>");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer groq-key");
  });

  it("uses ordered partial summaries for long context", async () => {
    const responses = ["Part one", "Part two", "Part three", "Combined brief"];
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: responses.shift() } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const long = `USER\n${"a".repeat(60_100)}\n\nASSISTANT\nsecond`;
    await expect(new GroqContextCondenser(async () => "key").condense(long)).resolves.toBe("Combined brief");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).messages[1].content).toContain("PARTIAL BRIEF 1");
  });

  it("classifies missing and invalid keys", async () => {
    await expect(new GroqContextCondenser(async () => undefined).condense("USER\nHello")).rejects.toMatchObject({ code: "missing-groq-key" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 401 })));
    await expect(new GroqContextCondenser(async () => "bad-key").condense("USER\nHello")).rejects.toMatchObject({ code: "invalid-groq-key" });
  });
});
