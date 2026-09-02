import type { ProcessingLevel } from "../shared/config";
import type { PromptPilotState } from "../shared/types";

export type UIAction = "undo" | "raw" | "copy" | "copy-prompt" | "configure" | "dismiss";

export class PromptPilotUI {
  readonly host = document.createElement("div");
  private readonly root: ShadowRoot;
  private readonly mic: HTMLButtonElement;
  private readonly level: HTMLSelectElement;
  private readonly status: HTMLButtonElement;
  private readonly shortcut: HTMLSpanElement;
  private readonly statusPopover: HTMLDivElement;
  private readonly statusDetail: HTMLDivElement;
  private readonly resultMenu: HTMLDivElement;
  private readonly undoAction: HTMLButtonElement;
  private readonly rawAction: HTMLButtonElement;
  private readonly copyAction: HTMLButtonElement;
  private readonly setupAction: HTMLButtonElement;
  private readonly promptCopyAction: HTMLButtonElement;
  private readonly dismissAction: HTMLButtonElement;
  private onAction?: (action: UIAction) => void;
  private currentState: PromptPilotState = "idle";
  private actionsVisible = false;
  private popoverOpen = false;

  constructor(onToggle: () => void, onAction: (action: UIAction) => void) {
    this.onAction = onAction;
    this.host.className = "prompt-pilot-host";
    this.host.dataset.promptPilot = "true";
    this.root = this.host.attachShadow({ mode: "open" });
    this.host.addEventListener("prompt-pilot:position", () => this.updatePopoverPlacement());
    this.host.addEventListener("prompt-pilot:placement-constrained", () => this.collapsePopoverForPlacement());

    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
        position: fixed;
        display: block;
        box-sizing: border-box;
        width: max-content;
        max-width: calc(100vw - 24px);
        z-index: 2147483647;
        color-scheme: light dark;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        --pp-bg: Canvas;
        --pp-fg: CanvasText;
        --pp-border: color-mix(in srgb, CanvasText 18%, transparent);
        --pp-hover: color-mix(in srgb, CanvasText 10%, Canvas);
      }
      .shell { position:relative; width:max-content; max-width:100%; }
      .bar {
        display:flex;
        align-items:center;
        gap:6px;
        box-sizing:border-box;
        width:max-content;
        max-width:calc(100vw - 24px);
        padding:4px;
        border:1px solid var(--pp-border);
        border-radius:12px;
        background:var(--pp-bg);
        color:var(--pp-fg);
        box-shadow:0 6px 22px rgb(0 0 0 / 22%);
        font:14px/1.2 system-ui, sans-serif;
        white-space:nowrap;
      }
      button, select {
        box-sizing:border-box;
        border:1px solid color-mix(in srgb, CanvasText 20%, transparent);
        border-radius:9px;
        background:color-mix(in srgb, CanvasText 5%, var(--pp-bg));
        color:inherit;
        font:inherit;
      }
      button { cursor:pointer; }
      button:hover, select:hover { background:var(--pp-hover); }
      button:focus-visible, select:focus-visible { outline:2px solid #5b9cff; outline-offset:1px; }
      button:disabled, select:disabled { cursor:default; opacity:.6; }
      .mic {
        display:inline-grid;
        place-items:center;
        width:36px;
        height:36px;
        flex:0 0 36px;
        padding:0;
        font-size:19px;
        line-height:1;
      }
      .mic svg { width:19px; height:19px; display:block; }
      .mic.recording { border-color:#ef4444; color:#ef4444; background:color-mix(in srgb, #ef4444 12%, var(--pp-bg)); }
      .level { width:58px; height:36px; padding:0 7px; flex:0 0 58px; }
      .shortcut { min-width:0; max-width:130px; overflow:hidden; text-overflow:ellipsis; opacity:.68; }
      .status-trigger {
        min-width:0;
        max-width:220px;
        min-height:30px;
        padding:5px 9px;
        overflow:hidden;
        text-overflow:ellipsis;
        text-align:left;
      }
      .status-trigger[hidden] { display:none; }
      .status-trigger.error { border-color:#e57373; color:#c62828; }
      .status-popover {
        position:absolute;
        left:0;
        top:calc(100% + 8px);
        z-index:1;
        box-sizing:border-box;
        width:min(360px, calc(100vw - 24px));
        max-height:min(70vh, 440px);
        overflow:auto;
        padding:12px;
        border:1px solid color-mix(in srgb, CanvasText 22%, transparent);
        border-radius:12px;
        background:var(--pp-bg);
        color:var(--pp-fg);
        box-shadow:0 8px 26px rgb(0 0 0 / 28%);
        white-space:normal;
      }
      .status-popover[data-align="right"] { left:auto; right:0; }
      .status-popover[data-side="top"] { top:auto; bottom:calc(100% + 8px); }
      .status-popover[hidden] { display:none; }
      .detail { overflow-wrap:anywhere; line-height:1.4; }
      .actions { display:grid; gap:6px; margin-top:10px; }
      .actions[hidden] { display:none; }
      .actions button { width:100%; min-height:32px; padding:6px 9px; text-align:left; }
      @media (max-width: 480px) {
        .shortcut { max-width:80px; }
        .status-trigger { max-width:150px; }
      }
    `;
    this.root.append(style);

    const shell = document.createElement("div"); shell.className = "shell";
    const bar = document.createElement("div"); bar.className = "bar";

    this.mic = document.createElement("button");
    this.mic.className = "mic";
    this.mic.type = "button";
    this.mic.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"></path></svg>`;
    this.mic.title = "Start recording";
    this.mic.setAttribute("aria-label", "Start recording");

    this.level = document.createElement("select");
    this.level.className = "level";
    this.level.title = "Processing level";
    this.level.setAttribute("aria-label", "Processing level");
    [[1, "L1"], [2, "L2"], [3, "L3"]].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = String(label);
      this.level.append(option);
    });
    this.level.value = "2";

    this.shortcut = document.createElement("span");
    this.shortcut.className = "shortcut";

    this.status = document.createElement("button");
    this.status.className = "status-trigger";
    this.status.type = "button";
    this.status.hidden = true;
    this.status.setAttribute("aria-label", "Prompt Pilot status");
    this.status.setAttribute("aria-expanded", "false");

    this.statusPopover = document.createElement("div");
    this.statusPopover.className = "status-popover";
    this.statusPopover.hidden = true;
    this.statusPopover.setAttribute("role", "status");

    this.statusDetail = document.createElement("div");
    this.statusDetail.className = "detail";
    this.statusPopover.append(this.statusDetail);

    this.resultMenu = document.createElement("div");
    this.resultMenu.className = "actions";
    this.resultMenu.hidden = true;
    this.resultMenu.setAttribute("role", "group");
    this.undoAction = this.createAction("Undo insertion", "undo");
    this.rawAction = this.createAction("Use raw transcript", "raw");
    this.copyAction = this.createAction("Copy raw transcript", "copy");
    this.setupAction = this.createAction("Configure Gemini", "configure");
    this.promptCopyAction = this.createAction("Copy refined prompt", "copy-prompt");
    this.dismissAction = this.createAction("Dismiss", "dismiss");
    this.resultMenu.append(this.undoAction, this.rawAction, this.copyAction, this.setupAction, this.promptCopyAction, this.dismissAction);
    this.statusPopover.append(this.resultMenu);

    bar.append(this.mic, this.level, this.shortcut, this.status);
    shell.append(bar, this.statusPopover);
    this.root.append(shell);

    this.mic.addEventListener("click", onToggle);
    this.status.addEventListener("click", () => this.setPopoverOpen(!this.popoverOpen));
    this.level.addEventListener("change", () => {
      const level = Number(this.level.value);
      if (level === 1 || level === 2 || level === 3) void chrome.runtime.sendMessage({ type: "SET_PROCESSING_LEVEL", level }).catch(() => undefined);
    });
    document.addEventListener("click", (event) => {
      if (!this.host.contains(event.target as Node)) this.setPopoverOpen(false);
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.setPopoverOpen(false);
    }, true);
    window.addEventListener("resize", () => this.updatePopoverPlacement(), { passive: true });
  }

  private createAction(label: string, action: UIAction): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.hidden = true;
    button.addEventListener("click", () => {
      this.setPopoverOpen(false);
      this.onAction?.(action);
    });
    return button;
  }

  get selectedLevel(): ProcessingLevel { return Number(this.level.value) as ProcessingLevel; }
  set selectedLevel(level: ProcessingLevel) { this.level.value = String(level); }

  setShortcut(value: string): void {
    this.shortcut.textContent = value ? `· ${value}` : "";
    this.host.dispatchEvent(new Event("prompt-pilot:layout"));
  }

  showResultActions(show: boolean, showSetup = false, showPrompt = false, showUndo = false, hasRaw = show): void {
    this.actionsVisible = show;
    this.undoAction.hidden = !showUndo;
    this.rawAction.hidden = !hasRaw;
    this.copyAction.hidden = !hasRaw;
    this.setupAction.hidden = !showSetup;
    this.promptCopyAction.hidden = !showPrompt;
    this.dismissAction.hidden = !show;
    this.resultMenu.hidden = !show;
    this.host.dispatchEvent(new Event("prompt-pilot:layout"));
    if (!show) this.setPopoverOpen(false);
    if (show && (this.currentState === "error" || this.currentState === "permission-needed")) this.setPopoverOpen(true);
  }

  setState(state: PromptPilotState, detail?: string): void {
    this.currentState = state;
    this.mic.classList.toggle("recording", state === "recording");
    this.mic.disabled = ["transcribing", "refining"].includes(state);
    this.level.disabled = this.mic.disabled;
    const labels: Partial<Record<PromptPilotState, string>> = {
      idle: "",
      recording: "Recording",
      transcribing: "Transcribing…",
      refining: "Refining…",
      inserted: "✓ Inserted",
      "permission-needed": "Microphone setup needed",
      error: "⚠ Error",
    };
    const label = labels[state] || "";
    const summary = detail ? this.summarize(detail) : label;
    this.status.textContent = summary;
    this.status.hidden = !summary;
    this.status.title = detail || label;
    this.status.classList.toggle("error", state === "error" || state === "permission-needed");
    this.statusDetail.textContent = detail || label;
    this.status.setAttribute("aria-expanded", String(this.popoverOpen));
    this.host.dataset.state = state;
    this.host.dispatchEvent(new Event("prompt-pilot:layout"));
    if (state === "idle") this.setPopoverOpen(false);
    if ((state === "error" || state === "permission-needed") && (detail || this.actionsVisible)) this.setPopoverOpen(true);
  }

  setTimer(seconds: number): void {
    if (this.currentState !== "recording") return;
    const time = new Date(seconds * 1000).toISOString().slice(14, 19);
    this.status.textContent = `Recording ${time}`;
    this.status.hidden = false;
    this.host.dispatchEvent(new Event("prompt-pilot:layout"));
  }

  private summarize(detail: string): string {
    const firstLine = detail.split(/\r?\n/, 1)[0].trim();
    return firstLine.length > 58 ? `${firstLine.slice(0, 55)}…` : firstLine;
  }

  private setPopoverOpen(open: boolean): void {
    this.popoverOpen = open && Boolean(this.status.textContent || this.actionsVisible);
    this.statusPopover.hidden = !this.popoverOpen;
    this.status.setAttribute("aria-expanded", String(this.popoverOpen));
    this.host.dispatchEvent(new Event("prompt-pilot:layout"));
    if (this.popoverOpen) this.updatePopoverPlacement();
  }

  private collapsePopoverForPlacement(): void {
    if (!this.popoverOpen) return;
    this.popoverOpen = false;
    this.statusPopover.hidden = true;
    this.status.setAttribute("aria-expanded", "false");
    this.host.dispatchEvent(new Event("prompt-pilot:layout"));
  }

  private updatePopoverPlacement(): void {
    if (!this.popoverOpen) return;
    const rect = this.host.getBoundingClientRect();
    const popoverRect = this.statusPopover.getBoundingClientRect();
    const popoverWidth = Math.min(360, Math.max(0, window.innerWidth - 24));
    this.statusPopover.dataset.align = rect.left + popoverWidth > window.innerWidth - 12 ? "right" : "left";
    this.statusPopover.dataset.side = rect.bottom + popoverRect.height + 8 > window.innerHeight - 12 ? "top" : "bottom";
  }
}
