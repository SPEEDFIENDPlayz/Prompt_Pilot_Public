import { describe, expect, it } from "vitest";
import { acceptsEngineProgress, shouldIgnoreState } from "../../src/shared/operation-phase";

describe("operation phase guards", () => {
  it("does not allow late transcription progress to regress refinement", () => {
    expect(shouldIgnoreState("refining", "transcribing")).toBe(true);
    expect(shouldIgnoreState("clarifying", "transcribing")).toBe(true);
    expect(shouldIgnoreState("transcribing", "recording")).toBe(true);
    expect(shouldIgnoreState("recording", "transcribing")).toBe(false);
  });

  it("stops accepting engine progress after refinement starts", () => {
    expect(acceptsEngineProgress("recording")).toBe(true);
    expect(acceptsEngineProgress("transcribing")).toBe(true);
    expect(acceptsEngineProgress("refining")).toBe(false);
    expect(acceptsEngineProgress("inserted")).toBe(false);
  });
});
