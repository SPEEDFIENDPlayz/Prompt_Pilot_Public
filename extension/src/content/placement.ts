export interface PlacementRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PlacementSize {
  width: number;
  height: number;
}

export type PlacementSide = "left" | "right" | "above" | "below";

export interface PlacementCandidate {
  side: PlacementSide;
  left: number;
  top: number;
  rect: PlacementRect;
}

export interface PlacementViewport {
  width: number;
  height: number;
  padding?: number;
  gap?: number;
}

export function intersects(a: PlacementRect, b: PlacementRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function getPlacementCandidates(
  surface: PlacementRect,
  panel: PlacementSize,
  viewport: PlacementViewport,
): PlacementCandidate[] {
  const padding = viewport.padding ?? 12;
  const gap = viewport.gap ?? 10;
  const maxLeft = Math.max(padding, viewport.width - panel.width - padding);
  const maxTop = Math.max(padding, viewport.height - panel.height - padding);
  const clampLeft = (left: number): number => Math.min(Math.max(padding, left), maxLeft);
  const clampTop = (top: number): number => Math.min(Math.max(padding, top), maxTop);
  const centeredTop = surface.top + (surface.bottom - surface.top - panel.height) / 2;
  const raw: Array<{ side: PlacementSide; left: number; top: number }> = [
    { side: "left", left: surface.left - panel.width - gap, top: centeredTop },
    { side: "right", left: surface.right + gap, top: centeredTop },
    { side: "above", left: surface.left, top: surface.top - panel.height - gap },
    { side: "below", left: surface.left, top: surface.bottom + gap },
  ];
  return raw.map(({ side, left, top }) => {
    const clampedLeft = clampLeft(left);
    const clampedTop = clampTop(top);
    return {
      side,
      left: clampedLeft,
      top: clampedTop,
      rect: { left: clampedLeft, top: clampedTop, right: clampedLeft + panel.width, bottom: clampedTop + panel.height },
    };
  });
}

export function chooseNonOverlappingPlacement(
  surface: PlacementRect,
  panel: PlacementSize,
  viewport: PlacementViewport,
): PlacementCandidate | undefined {
  return getPlacementCandidates(surface, panel, viewport).find((candidate) => !intersects(candidate.rect, surface));
}
