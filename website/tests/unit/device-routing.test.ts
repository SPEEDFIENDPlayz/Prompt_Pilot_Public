import { describe, expect, it } from "vitest";
import { classifyDeviceClass, shouldUseCloud } from "../../src/core/device-capabilities";
import { mergeChunkText } from "../../src/transcription/chunked-local";
import { GeminiTranscriber } from "../../src/transcription/cloud-transcriber";

describe("device transcription routing", () => {
  it("classifies phones before desktop capability", () => {
    expect(classifyDeviceClass({ isPhone: true, hasWebGPU: true, hardwareConcurrency: 12 })).toBe("phone");
    expect(classifyDeviceClass({ isPhone: false, hasWebGPU: true, hardwareConcurrency: 8, deviceMemory: 8 })).toBe("capable-desktop");
    expect(classifyDeviceClass({ isPhone: false, hasWebGPU: false, hardwareConcurrency: 2, deviceMemory: 2 })).toBe("constrained-desktop");
  });
  it("keeps capable desktops local in automatic mode", () => {
    expect(shouldUseCloud("auto", "capable-desktop")).toBe(false);
    expect(shouldUseCloud("auto", "constrained-desktop")).toBe(true);
  });

  it("honors explicit local and cloud choices", () => {
    expect(shouldUseCloud("local", "constrained-desktop")).toBe(false);
    expect(shouldUseCloud("cloud", "capable-desktop")).toBe(true);
  });
});

describe("background transcript merge", () => {
  it("removes the repeated overlap at a chunk boundary", () => {
    expect(mergeChunkText("Please preserve the existing behavior", "the existing behavior and add tests")).toBe("Please preserve the existing behavior and add tests");
  });

  it("does not discard distinct adjacent speech", () => {
    expect(mergeChunkText("Fix the bug", "Then explain the cause")).toBe("Fix the bug Then explain the cause");
  });
});

describe("cloud transcription request", () => {
  it("uploads audio through the Files API and reads the transcript response", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (calls.length === 1) return new Response(null, { status: 200, headers: { "x-goog-upload-url": "https://upload.test/file" } });
      if (calls.length === 2) return new Response(JSON.stringify({ file: { name: "files/test", uri: "https://generativelanguage.googleapis.com/v1beta/files/test", mimeType: "audio/webm" } }), { status: 200 });
      if (calls.length === 3) return new Response(JSON.stringify({ steps: [{ type: "model_output", content: [{ text: "raw transcript" }] }] }), { status: 200 });
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    try {
      const result = await new GeminiTranscriber(async () => "test-key").transcribe(new Blob(["audio"], { type: "audio/webm" }));
      expect(result).toMatchObject({ text: "raw transcript", provider: "gemini-transcribe" });
      expect(calls[0].init?.headers).toMatchObject({ "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start" });
      expect(JSON.stringify(calls[2].init?.body)).toContain("gemini-3.5-transcribe");
      expect(calls[3].url).toContain("/files/test");
    } finally { globalThis.fetch = originalFetch; }
  });
});
