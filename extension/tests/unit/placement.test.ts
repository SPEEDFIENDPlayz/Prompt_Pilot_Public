import { describe, expect, it } from "vitest";
import { chooseNonOverlappingPlacement, getPlacementCandidates, intersects, type PlacementRect } from "../../src/content/placement";

const rect = (left: number, top: number, right: number, bottom: number): PlacementRect => ({ left, top, right, bottom });

describe("Prompt Pilot placement", () => {
  it("prefers the left side when the full composer surface leaves room", () => {
    const placement = chooseNonOverlappingPlacement(rect(360, 600, 760, 650), { width: 180, height: 42 }, { width: 1200, height: 800 });
    expect(placement?.side).toBe("left");
    expect(intersects(placement!.rect, rect(360, 600, 760, 650))).toBe(false);
  });

  it("uses the right side when the left side is occupied by the viewport edge", () => {
    const placement = chooseNonOverlappingPlacement(rect(30, 600, 600, 650), { width: 180, height: 42 }, { width: 800, height: 800 });
    expect(placement?.side).toBe("right");
  });

  it("falls back above a full-width composer", () => {
    const placement = chooseNonOverlappingPlacement(rect(0, 600, 1200, 650), { width: 220, height: 42 }, { width: 1200, height: 800 });
    expect(placement?.side).toBe("above");
    expect(intersects(placement!.rect, rect(0, 600, 1200, 650))).toBe(false);
  });

  it("uses below when the composer is near the top and side space is unavailable", () => {
    const placement = chooseNonOverlappingPlacement(rect(0, 12, 1200, 62), { width: 220, height: 42 }, { width: 1200, height: 800 });
    expect(placement?.side).toBe("below");
  });

  it("rejects a placement whose expanded result popover would intersect the composer", () => {
    const candidates = getPlacementCandidates(rect(250, 500, 950, 550), { width: 360, height: 260 }, { width: 1200, height: 800 });
    expect(candidates.some((candidate) => candidate.side === "left" && intersects(candidate.rect, rect(250, 500, 950, 550)))).toBe(true);
    const placement = chooseNonOverlappingPlacement(rect(250, 500, 950, 550), { width: 360, height: 260 }, { width: 1200, height: 800 });
    expect(placement?.side).toBe("above");
  });

  it("clamps candidates inside the viewport padding", () => {
    const candidates = getPlacementCandidates(rect(5, 5, 100, 45), { width: 200, height: 42 }, { width: 320, height: 240, padding: 12 });
    for (const candidate of candidates) {
      expect(candidate.rect.left).toBeGreaterThanOrEqual(12);
      expect(candidate.rect.top).toBeGreaterThanOrEqual(12);
      expect(candidate.rect.right).toBeLessThanOrEqual(308);
      expect(candidate.rect.bottom).toBeLessThanOrEqual(228);
    }
  });

  it("reports no safe placement when the surface fills the viewport", () => {
    const placement = chooseNonOverlappingPlacement(rect(0, 0, 800, 600), { width: 200, height: 100 }, { width: 800, height: 600, padding: 12 });
    expect(placement).toBeUndefined();
  });
});
