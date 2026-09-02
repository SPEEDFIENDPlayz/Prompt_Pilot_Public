import { describe, expect, it } from "vitest";
import { PROCESSING_MODES } from "../../src/shared/processing-modes";

describe("processing modes", () => {
  it("has three distinct user-selectable instructions", () => {
    expect(Object.keys(PROCESSING_MODES)).toEqual(["1", "2", "3"]);
    expect(new Set(Object.values(PROCESSING_MODES).map((mode) => mode.instruction)).size).toBe(3);
    expect(PROCESSING_MODES[2].instruction).toContain("Do not invent requirements");
    expect(PROCESSING_MODES[3].instruction).toContain("Return ONLY the final enhanced prompt");
  });
});
