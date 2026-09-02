import { getPlacementCandidates, intersects, type PlacementRect, type PlacementSide } from "./placement";

export interface InsertionRecord {
  before: string;
  after: string;
  inserted: string;
}

type Editable = HTMLTextAreaElement | HTMLElement;

export interface ComposerTarget {
  editable: Editable;
  surface: HTMLElement;
}

function isVisible(element: Element): boolean {
  const node = element as HTMLElement;
  const style = getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function isEditable(element: Element): element is Editable {
  return element instanceof HTMLTextAreaElement || (element instanceof HTMLElement && element.isContentEditable);
}

function unionRect(rects: PlacementRect[]): PlacementRect {
  return rects.reduce((combined, rect) => ({
    left: Math.min(combined.left, rect.left),
    right: Math.max(combined.right, rect.right),
    top: Math.min(combined.top, rect.top),
    bottom: Math.max(combined.bottom, rect.bottom),
  }));
}

export class ChatGPTAdapter {
  private mount?: HTMLElement;
  private anchoredComposer?: Editable;
  private anchoredSurface?: HTMLElement;
  private repositionFrame?: number;
  private listenersAttached = false;
  private layoutHost?: HTMLElement;

  private readonly scheduleReposition = (): void => {
    if (!this.mount?.isConnected || !this.anchoredComposer?.isConnected) return;
    if (this.repositionFrame !== undefined) cancelAnimationFrame(this.repositionFrame);
    this.repositionFrame = requestAnimationFrame(() => {
      this.repositionFrame = undefined;
      this.positionMount();
    });
  };

  findComposer(): Editable | null {
    const direct = document.querySelector("#prompt-textarea");
    if (direct && isEditable(direct) && isVisible(direct)) return direct;

    const form = [...document.querySelectorAll("form")].find((candidate) => {
      if (!isVisible(candidate)) return false;
      return [...candidate.querySelectorAll("textarea, [contenteditable='true']")].some((el) => isEditable(el) && isVisible(el));
    });
    const inForm = form && [...form.querySelectorAll("textarea, [contenteditable='true']")].find((el) => isEditable(el) && isVisible(el));
    if (inForm && isEditable(inForm)) return inForm;

    const aria = [...document.querySelectorAll("textarea, [contenteditable='true'], [role='textbox']")].find((el) => {
      const label = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("placeholder") ?? ""}`.toLowerCase();
      return isEditable(el) && isVisible(el) && (label.includes("message") || label.includes("chatgpt"));
    });
    return aria && isEditable(aria) ? aria : null;
  }

  findComposerTarget(): ComposerTarget | null {
    const editable = this.findComposer();
    if (!editable) return null;
    return { editable, surface: this.findComposerSurface(editable) };
  }

  private findComposerSurface(editable: Editable): HTMLElement {
    const editableRect = editable.getBoundingClientRect();
    const form = editable.closest("form");
    if (form instanceof HTMLElement && isVisible(form)) {
      const formRect = form.getBoundingClientRect();
      if (formRect.height <= 260 && formRect.width >= editableRect.width) return form;
    }

    let ancestor = editable.parentElement;
    while (ancestor && ancestor !== document.body) {
      if (isVisible(ancestor)) {
        const rect = ancestor.getBoundingClientRect();
        const isCompact = rect.height <= 260 && rect.width >= editableRect.width;
        const expandsBeyondEditor = rect.width > editableRect.width + 8 || rect.height > editableRect.height + 8;
        if (isCompact && expandsBeyondEditor) return ancestor;
      }
      ancestor = ancestor.parentElement;
    }
    return editable;
  }

  findMountTarget(composer = this.findComposer()): HTMLElement | null {
    return composer && document.body ? document.body : null;
  }

  mountControls(host: HTMLElement): boolean {
    const target = this.findComposerTarget();
    if (!target) {
      this.mount?.remove();
      this.mount = undefined;
      this.anchoredComposer = undefined;
      this.anchoredSurface = undefined;
      return false;
    }

    // Keep Prompt Pilot outside ChatGPT's composer DOM. ChatGPT can apply
    // narrow/fixed layout rules to that subtree, while a body-level fixed
    // host can size itself without changing the input width.
    if (this.mount !== host && this.mount?.isConnected) this.mount.remove();
    host.dataset.composer = "prompt-pilot";
    host.style.display = "block";
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    if (host.parentElement !== document.body) document.body.append(host);
    this.mount = host;
    this.anchoredComposer = target.editable;
    this.anchoredSurface = target.surface;
    if (this.layoutHost !== host) {
      this.layoutHost?.removeEventListener("prompt-pilot:layout", this.scheduleReposition);
      host.addEventListener("prompt-pilot:layout", this.scheduleReposition);
      this.layoutHost = host;
    }
    if (!this.listenersAttached) {
      window.addEventListener("resize", this.scheduleReposition, { passive: true });
      document.addEventListener("scroll", this.scheduleReposition, { passive: true, capture: true });
      this.listenersAttached = true;
    }
    this.positionMount();
    return true;
  }

  private positionMount(): void {
    const host = this.mount;
    const surface = this.anchoredSurface;
    if (!host?.isConnected || !surface?.isConnected) return;
    const surfaceRect = surface.getBoundingClientRect();
    if (!surfaceRect.width || !surfaceRect.height) return;

    const hostRect = host.getBoundingClientRect();
    const viewportPadding = 12;
    const width = Math.min(hostRect.width || 220, Math.max(0, window.innerWidth - viewportPadding * 2));
    const height = hostRect.height || 36;
    const candidates = getPlacementCandidates(
      surfaceRect,
      { width, height },
      { width: window.innerWidth, height: window.innerHeight, padding: viewportPadding, gap: 10 },
    );

    let nonOverlapping: typeof candidates[number] | undefined;
    let nonOverlappingInViewport: typeof candidates[number] | undefined;
    for (const candidate of candidates) {
      this.setHostPosition(host, candidate.left, candidate.top, candidate.side);
      const occupied = this.getOccupiedRect(host);
      if (intersects(occupied, surfaceRect)) continue;
      nonOverlapping ??= candidate;
      if (occupied.left >= viewportPadding && occupied.top >= viewportPadding
        && occupied.right <= window.innerWidth - viewportPadding && occupied.bottom <= window.innerHeight - viewportPadding) {
        nonOverlappingInViewport = candidate;
        break;
      }
    }

    const chosen = nonOverlappingInViewport ?? nonOverlapping ?? candidates[2] ?? candidates[0];
    const placementConstrained = !nonOverlappingInViewport;
    host.dataset.placementConstrained = placementConstrained ? "true" : "false";
    this.setHostPosition(host, chosen.left, chosen.top, chosen.side);
    if (placementConstrained) host.dispatchEvent(new Event("prompt-pilot:placement-constrained"));
  }

  private setHostPosition(host: HTMLElement, left: number, top: number, side?: PlacementSide): void {
    host.style.left = `${Math.round(left)}px`;
    host.style.top = `${Math.round(top)}px`;
    if (side) host.dataset.placement = side;
    host.dispatchEvent(new Event("prompt-pilot:position"));
  }

  private getOccupiedRect(host: HTMLElement): PlacementRect {
    const rects: PlacementRect[] = [host.getBoundingClientRect()];
    const popover = host.shadowRoot?.querySelector<HTMLElement>(".status-popover");
    if (popover && !popover.hidden) rects.push(popover.getBoundingClientRect());
    return unionRect(rects);
  }

  readText(composer = this.findComposer()): string {
    if (!composer) return "";
    if (composer instanceof HTMLTextAreaElement) return composer.value;
    return (composer.innerText || composer.textContent || "").replace(/\u00a0/g, " ");
  }

  focusComposer(composer = this.findComposer()): void {
    composer?.focus();
  }

  appendText(text: string): InsertionRecord | null {
    const composer = this.findComposer();
    if (!composer) return null;
    const before = this.readText(composer);
    const inserted = before.trim() ? `\n\n${text}` : text;
    this.focusComposer(composer);
    if (composer instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(composer, before + inserted);
      composer.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      composer.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(composer);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
      const insertedByBrowser = document.execCommand("insertText", false, inserted);
      if (!insertedByBrowser) {
        const textNode = document.createTextNode(inserted);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
        composer.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: inserted }));
      }
    }
    const after = this.readText(composer);
    if (!after.includes(text)) return null;
    return { before, after, inserted };
  }

  replaceExact(expected: string, replacement: string): boolean {
    const composer = this.findComposer();
    if (!composer || this.readText(composer) !== expected) return false;
    if (composer instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(composer, replacement);
      composer.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      composer.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      this.focusComposer(composer);
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(composer);
      selection?.removeAllRanges();
      selection?.addRange(range);
      if (!document.execCommand("insertText", false, replacement)) {
        composer.textContent = replacement;
        composer.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: replacement }));
      }
    }
    return this.readText(composer) === replacement;
  }
}
