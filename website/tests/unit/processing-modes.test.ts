import { describe, expect, it } from "vitest";
import { PROCESSING_MODES } from "../../src/core/processing-modes";

describe("processing modes", () => {
  it("keeps the three established Prompt Pilot instructions", () => {
    expect(Object.keys(PROCESSING_MODES)).toEqual(["1", "2", "3"]);
    expect(PROCESSING_MODES[1].instruction).toContain("speech-to-text cleanup");
    expect(PROCESSING_MODES[2].instruction).toContain("prompt refinement");
    expect(PROCESSING_MODES[3].instruction).toContain("expert prompt engineer");
  });
});
