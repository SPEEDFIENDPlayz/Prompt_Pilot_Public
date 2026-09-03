import type { ProcessingLevel } from "../shared/config";
import type { PromptPilotState } from "../shared/types";

export type UIAction =
  | "undo"
  | "raw"
  | "copy"
  | "copy-prompt"
  | "configure"
  | "configure-groq"
  | "dismiss"
  | "make-clearer"
  | "apply-clearer"
  | "copy-clearer"
  | "keep-clearer"
  | "retry-context"
  | "refine-without-context";

export interface ResultActionOptions {
  show: boolean;
  showGeminiSetup?: boolean;
  showGroqSetup?: boolean;
  showPromptCopy?: boolean;
  showUndo?: boolean;
  showRaw?: boolean;
  showMakeClearer?: boolean;
  showClearerReady?: boolean;
  showContextRetry?: boolean;
  showRefineWithoutContext?: boolean;
}

export class PromptPilotUI {
  readonly host = document.createElement("div");
  private readonly root: ShadowRoot;
  private readonly mic: HTMLButtonElement;
  private readonly level: HTMLSelectElement;
  private readonly contextToggle: HTMLInputElement;
  private readonly contextLabel: HTMLLabelElement;
  private readonly status: HTMLButtonElement;
  private readonly shortcut: HTMLSpanElement;
  private readonly statusPopover: HTMLDivElement;
  private readonly statusDetail: HTMLDivElement;
  private readonly resultMenu: HTMLDivElement;
  private readonly actions = new Map<UIAction, HTMLButtonElement>();
  private onAction?: (action: UIAction) => void;
  private currentState: PromptPilotState = "idle";
  private actionsVisible = false;
  private popoverOpen = false;
  private contextEligible = false;
  private groqConfigured = false;

  constructor(onToggle: () => void, onAction: (action: UIAction) => void) {
    this.onAction = onAction;
    this.host.className = "prompt-pilot-host";
    this.host.dataset.promptPilot = "true";
    this.root = this.host.attachShadow({ mode: "open" });
    this.host.addEventListener("prompt-pilot:position", () => this.updatePopoverPlacement());
    this.host.addEventListener("prompt-pilot:placement-constrained", () => this.collapsePopoverForPlacement());

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; position: fixed; display: block; box-sizing: border-box; width: max-content; max-width: calc(100vw - 24px); z-index: 2147483647; color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; --pp-bg: #ffffff; --pp-fg: #2f2f2f; --pp-muted: #6b6b6b; --pp-border: rgb(0 0 0 / 13%); --pp-hover: #f4f4f4; --pp-selected: #ececec; --pp-focus: #10a37f; --pp-danger: #dc2626; }
      :host([data-theme="dark"]) { color-scheme: dark; --pp-bg: #2f2f2f; --pp-fg: #ececec; --pp-muted: #a9a9a9; --pp-border: rgb(255 255 255 / 16%); --pp-hover: #3a3a3a; --pp-selected: #444444; --pp-focus: #19c37d; --pp-danger: #f87171; }
      .shell { position: relative; width: max-content; max-width: min(100vw - 24px, 520px); }
      .bar { display: flex; align-items: center; gap: 6px; box-sizing: border-box; width: max-content; max-width: min(100vw - 24px, 520px); padding: 4px; border: 1px solid var(--pp-border); border-radius: 12px; background: var(--pp-bg); color: var(--pp-fg); box-shadow: 0 4px 18px rgb(0 0 0 / 18%); font: 14px/1.2 system-ui, sans-serif; white-space: nowrap; }
      button, select { box-sizing: border-box; border: 1px solid var(--pp-border); border-radius: 9px; background: transparent; color: inherit; font: inherit; }
      button { cursor: pointer; }
      button:hover, select:hover { background: var(--pp-hover); }
      button:focus-visible, select:focus-visible, input:focus-visible + span { outline: 2px solid var(--pp-focus); outline-offset: 1px; }
      button:disabled, select:disabled { cursor: default; opacity: .55; }
      .mic { display: inline-grid; place-items: center; width: 36px; height: 36px; flex: 0 0 36px; padding: 0; }
      .mic svg { width: 19px; height: 19px; display: block; }
      .mic.recording { border-color: var(--pp-danger); color: var(--pp-danger); background: color-mix(in srgb, var(--pp-danger) 12%, var(--pp-bg)); }
      .level { width: 86px; height: 36px; padding: 0 7px; flex: 0 0 86px; }
      .context-control { display: none; align-items: center; gap: 5px; min-height: 30px; padding: 0 7px; border-radius: 8px; color: var(--pp-muted); cursor: pointer; }
      .context-control.visible { display: inline-flex; }
      .context-control input { width: 15px; height: 15px; margin: 0; accent-color: var(--pp-focus); }
      .context-control span { max-width: 152px; overflow: hidden; text-overflow: ellipsis; }
      .shortcut { min-width: 0; max-width: 130px; overflow: hidden; text-overflow: ellipsis; color: var(--pp-muted); }
      .status-trigger { min-width: 0; max-width: 220px; min-height: 30px; padding: 5px 9px; overflow: hidden; text-overflow: ellipsis; text-align: left; }
      .status-trigger[hidden] { display: none; }
      .status-trigger.error { border-color: var(--pp-danger); color: var(--pp-danger); }
      .status-popover { position: absolute; left: 0; top: calc(100% + 8px); z-index: 1; box-sizing: border-box; width: min(360px, calc(100vw - 24px)); max-height: min(70vh, 460px); overflow: auto; padding: 13px; border: 1px solid var(--pp-border); border-radius: 12px; background: var(--pp-bg); color: var(--pp-fg); box-shadow: 0 8px 26px rgb(0 0 0 / 28%); white-space: normal; }
      .status-popover[data-align="right"] { left: auto; right: 0; }
      .status-popover[data-side="top"] { top: auto; bottom: calc(100% + 8px); }
      .status-popover[hidden] { display: none; }
      .detail { overflow-wrap: anywhere; line-height: 1.45; color: var(--pp-muted); }
      .actions { display: grid; gap: 6px; margin-top: 11px; }
      .actions[hidden] { display: none; }
      .actions button { width: 100%; min-height: 34px; padding: 7px 10px; text-align: left; }
      .actions button.primary { background: var(--pp-selected); font-weight: 600; }
      @media (max-width: 720px) { .shortcut { max-width: 80px; } .context-control span { max-width: 92px; } }
      @media (max-width: 560px) { .shortcut { display: none; } .context-control span { max-width: 76px; } }
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
    this.level.title = "Prompt style";
    this.level.setAttribute("aria-label", "Prompt style");
    [[1, "Natural"], [2, "Clean"], [3, "Pro"]].forEach(([value, label]) => { const option = document.createElement("option"); option.value = String(value); option.textContent = String(label); this.level.append(option); });
    this.level.value = "2";

    this.contextLabel = document.createElement("label");
    this.contextLabel.className = "context-control";
    this.contextToggle = document.createElement("input");
    this.contextToggle.type = "checkbox";
    this.contextToggle.setAttribute("aria-label", "Include current chat context");
    const contextText = document.createElement("span"); contextText.textContent = "Chat context";
    this.contextLabel.append(this.contextToggle, contextText);
    this.contextLabel.addEventListener("click", (event) => { if (!this.groqConfigured) { event.preventDefault(); this.onAction?.("configure-groq"); } });

    this.shortcut = document.createElement("span"); this.shortcut.className = "shortcut";
    this.status = document.createElement("button");
    this.status.className = "status-trigger";
    this.status.type = "button";
    this.status.hidden = true;
    this.status.setAttribute("aria-label", "Prompt Pilot status");
    this.status.setAttribute("aria-expanded", "false");
    this.status.setAttribute("aria-live", "polite");

    this.statusPopover = document.createElement("div");
    this.statusPopover.className = "status-popover";
    this.statusPopover.hidden = true;
    this.statusPopover.setAttribute("role", "status");
    this.statusDetail = document.createElement("div"); this.statusDetail.className = "detail"; this.statusPopover.append(this.statusDetail);
    this.resultMenu = document.createElement("div"); this.resultMenu.className = "actions"; this.resultMenu.hidden = true; this.resultMenu.setAttribute("role", "group");
    const definitions: Array<[UIAction, string]> = [["make-clearer", "Make clearer"], ["apply-clearer", "Apply clearer version"], ["copy-clearer", "Copy clearer version"], ["undo", "Undo insertion"], ["raw", "Use raw transcript"], ["copy", "Copy raw transcript"], ["copy-prompt", "Copy refined prompt"], ["retry-context", "Retry chat context"], ["refine-without-context", "Refine without context"], ["configure", "Configure Gemini"], ["configure-groq", "Configure Groq"], ["keep-clearer", "Keep current"], ["dismiss", "Dismiss"]];
    for (const [action, label] of definitions) this.actions.set(action, this.createAction(label, action));
    for (const action of definitions.map(([value]) => value)) this.resultMenu.append(this.actions.get(action)!);

    bar.append(this.mic, this.level, this.contextLabel, this.shortcut, this.status);
    shell.append(bar, this.statusPopover);
    this.statusPopover.append(this.resultMenu);
    this.root.append(shell);

    this.mic.addEventListener("click", onToggle);
    this.status.addEventListener("click", () => this.setPopoverOpen(!this.popoverOpen));
    this.level.addEventListener("change", () => { const level = Number(this.level.value); if (level === 1 || level === 2 || level === 3) void chrome.runtime.sendMessage({ type: "SET_PROCESSING_LEVEL", level }).catch(() => undefined); });
    this.contextToggle.addEventListener("change", () => { if (!this.contextEligible || !this.groqConfigured) this.contextToggle.checked = false; });
    document.addEventListener("click", (event) => { if (!this.host.contains(event.target as Node)) this.setPopoverOpen(false); }, true);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") this.setPopoverOpen(false); }, true);
    window.addEventListener("resize", () => this.updatePopoverPlacement(), { passive: true });
  }

  private createAction(label: string, action: UIAction): HTMLButtonElement { const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.hidden = true; button.addEventListener("click", () => { this.setPopoverOpen(false); this.onAction?.(action); }); return button; }
  get selectedLevel(): ProcessingLevel { return Number(this.level.value) as ProcessingLevel; }
  set selectedLevel(level: ProcessingLevel) { this.level.value = String(level); }
  get includeChatContext(): boolean { return this.contextEligible && this.groqConfigured && this.contextToggle.checked; }
  set includeChatContext(value: boolean) { this.contextToggle.checked = value && this.contextEligible && this.groqConfigured; }

  setContextAvailability(eligible: boolean, groqConfigured: boolean): void {
    this.contextEligible = eligible;
    this.groqConfigured = groqConfigured;
    this.contextLabel.classList.toggle("visible", eligible);
    this.contextToggle.disabled = !groqConfigured;
    this.contextLabel.title = groqConfigured ? "Include the current ChatGPT conversation as reference context" : "Configure a Groq API key to use chat context";
    const text = this.contextLabel.querySelector("span");
    if (text) text.textContent = groqConfigured ? "Chat context" : "Chat context · setup";
    if (!eligible || !groqConfigured) this.contextToggle.checked = false;
    this.host.dispatchEvent(new Event("prompt-pilot:layout"));
  }

  setShortcut(value: string): void { this.shortcut.textContent = value ? `· ${value}` : ""; this.host.dispatchEvent(new Event("prompt-pilot:layout")); }

  showResultActions(options: ResultActionOptions): void {
    this.actionsVisible = options.show;
    const visible: UIAction[] = [];
    if (options.showMakeClearer) visible.push("make-clearer");
    if (options.showClearerReady) visible.push("apply-clearer", "copy-clearer", "keep-clearer");
    if (options.showUndo) visible.push("undo");
    if (options.showRaw) visible.push("raw", "copy");
    if (options.showPromptCopy) visible.push("copy-prompt");
    if (options.showContextRetry) visible.push("retry-context");
    if (options.showRefineWithoutContext) visible.push("refine-without-context");
    if (options.showGeminiSetup) visible.push("configure");
    if (options.showGroqSetup) visible.push("configure-groq");
    if (options.show) visible.push("dismiss");
    for (const [action, button] of this.actions) button.hidden = !visible.includes(action);
    this.resultMenu.hidden = !options.show;
    this.host.dispatchEvent(new Event("prompt-pilot:layout"));
    if (!options.show) this.setPopoverOpen(false);
    else if (this.currentState === "error" || this.currentState === "permission-needed" || options.showClearerReady) this.setPopoverOpen(true);
  }

  setState(state: PromptPilotState, detail?: string): void {
    this.currentState = state;
    const busy = ["transcribing", "refining", "clarifying"].includes(state);
    this.mic.classList.toggle("recording", state === "recording");
    this.mic.disabled = busy;
    this.level.disabled = busy || state === "recording";
    this.contextToggle.disabled = busy || state === "recording" || !this.groqConfigured;
    const labels: Partial<Record<PromptPilotState, string>> = { idle: "", recording: "Recording", transcribing: "Transcribing…", refining: "Refining…", clarifying: "Making clearer…", inserted: "✓ Inserted", "permission-needed": "Microphone setup needed", error: "⚠ Error" };
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

  setTimer(seconds: number): void { if (this.currentState !== "recording") return; const time = new Date(seconds * 1000).toISOString().slice(14, 19); this.status.textContent = `Recording ${time}`; this.status.hidden = false; this.host.dispatchEvent(new Event("prompt-pilot:layout")); }
  private summarize(detail: string): string { const firstLine = detail.split(/\r?\n/, 1)[0].trim(); return firstLine.length > 58 ? `${firstLine.slice(0, 55)}…` : firstLine; }
  private setPopoverOpen(open: boolean): void { this.popoverOpen = open && Boolean(this.status.textContent || this.actionsVisible); this.statusPopover.hidden = !this.popoverOpen; this.status.setAttribute("aria-expanded", String(this.popoverOpen)); this.host.dispatchEvent(new Event("prompt-pilot:layout")); if (this.popoverOpen) this.updatePopoverPlacement(); }
  private collapsePopoverForPlacement(): void { if (!this.popoverOpen) return; this.popoverOpen = false; this.statusPopover.hidden = true; this.status.setAttribute("aria-expanded", "false"); this.host.dispatchEvent(new Event("prompt-pilot:layout")); }
  private updatePopoverPlacement(): void { if (!this.popoverOpen) return; const rect = this.host.getBoundingClientRect(); const popoverRect = this.statusPopover.getBoundingClientRect(); const popoverWidth = Math.min(360, Math.max(0, window.innerWidth - 24)); this.statusPopover.dataset.align = rect.left + popoverWidth > window.innerWidth - 12 ? "right" : "left"; this.statusPopover.dataset.side = rect.bottom + popoverRect.height + 8 > window.innerHeight - 12 ? "top" : "bottom"; }
}
