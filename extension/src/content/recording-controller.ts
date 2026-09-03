import type { ProcessingLevel } from "../shared/config";
import type { OperationResult, ProgressMessage } from "../shared/types";
import { ChatGPTAdapter, type ChatContextExport, type InsertionRecord } from "./chatgpt-adapter";
import { PromptPilotUI, type ResultActionOptions, type UIAction } from "./injected-ui";
import { detectDeviceCapabilities, type TranscriptionMode } from "../shared/device-capabilities";
import { shouldIgnoreState, type OperationPhase } from "../shared/operation-phase";

type ControllerPhase = OperationPhase;

export class RecordingController {
  readonly adapter = new ChatGPTAdapter();
  readonly ui: PromptPilotUI;
  private timer?: number;
  private startedAt = 0;
  private recording = false;
  private activeOperationId?: string;
  private activePhase: ControllerPhase = "idle";
  private activeContextExport?: ChatContextExport;
  private last?: { result: OperationResult; insertion?: InsertionRecord; clarified?: string };
  private transcriptionMode: TranscriptionMode = "auto";
  private groqConfigured = false;
  private readonly deviceClass = detectDeviceCapabilities().deviceClass;

  constructor() {
    this.ui = new PromptPilotUI(() => void this.toggleRecording(), (action) => void this.handleAction(action));
    void chrome.runtime.sendMessage({ type: "GET_PROCESSING_LEVEL" }).then(({ processingLevel }) => { if (processingLevel === 1 || processingLevel === 2 || processingLevel === 3) this.ui.selectedLevel = processingLevel; }).catch(() => undefined);
    void chrome.runtime.sendMessage({ type: "GET_SHORTCUT" }).then((reply) => this.ui.setShortcut(reply?.shortcut ?? "")).catch(() => undefined);
    void this.refreshGroqStatus();
    void chrome.runtime.sendMessage({ type: "GET_TRANSCRIPTION_MODE" }).then((reply) => {
      if (reply?.transcriptionMode === "local" || reply?.transcriptionMode === "cloud" || reply?.transcriptionMode === "auto") this.transcriptionMode = reply.transcriptionMode;
      this.updateContextAvailability();
    }).catch(() => undefined);
    window.addEventListener("focus", () => { void this.refreshSettings(); }, { passive: true });
  }

  mount(): boolean { return this.adapter.mountControls(this.ui.host); }

  async toggleRecording(): Promise<void> {
    if (this.activePhase === "transcribing" || this.activePhase === "refining" || this.activePhase === "clarifying") {
      this.ui.setState(this.activePhase, "Still processing…");
      return;
    }
    if (this.recording) {
      this.recording = false;
      if (this.timer) { window.clearInterval(this.timer); this.timer = undefined; }
      this.activePhase = "transcribing";
      this.ui.setState("transcribing", "Finalizing transcript…");
      try { await chrome.runtime.sendMessage({ type: "TOGGLE_RECORDING", level: this.ui.selectedLevel, transcriptionMode: this.transcriptionMode, deviceClass: this.deviceClass }); }
      catch (error) { this.ui.setState("error", error instanceof Error ? error.message : "Could not stop recording."); }
      return;
    }

    const includeChatContext = this.ui.includeChatContext;
    this.activeContextExport = includeChatContext ? this.adapter.exportConversation() ?? undefined : undefined;
    // Context is an explicit per-recording opt-in, never a sticky setting.
    this.ui.includeChatContext = false;
    // A new recording replaces the previous temporary result. This also
    // prevents a late clarity response from an older operation being applied
    // to the new recording.
    this.last = undefined;
    this.ui.showResultActions({ show: false });
    this.recording = true;
    this.activePhase = "recording";
    this.startedAt = Date.now();
    this.ui.setState("recording");
    this.timer = window.setInterval(() => this.ui.setTimer(Math.floor((Date.now() - this.startedAt) / 1000)), 1000);
    try {
      await chrome.runtime.sendMessage({ type: "TOGGLE_RECORDING", level: this.ui.selectedLevel, transcriptionMode: this.transcriptionMode, deviceClass: this.deviceClass, includeChatContext, chatContextExport: this.activeContextExport?.text });
    } catch (error) {
      this.recording = false;
      if (this.timer) { window.clearInterval(this.timer); this.timer = undefined; }
      this.activePhase = "error";
      this.ui.setState("error", error instanceof Error ? error.message : "Could not start recording.");
    }
  }

  async handleMessage(message: ProgressMessage, fromPendingResult = false): Promise<void> {
    if (message.type === "STATE") {
      if (this.activeOperationId && message.operationId !== this.activeOperationId) return;
      if (message.state === "recording") {
        if (shouldIgnoreState(this.activePhase, message.state)) return;
        this.activeOperationId = message.operationId;
        this.activePhase = "recording";
      } else if (shouldIgnoreState(this.activePhase, message.state)) return;
      else if (message.state === "clarifying" && this.activeOperationId && message.operationId !== this.activeOperationId && message.operationId !== this.last?.result.operationId) return;
      if (message.state === "transcribing") this.activePhase = "transcribing";
      if (message.state === "refining") this.activePhase = "refining";
      if (message.state === "clarifying") this.activePhase = "clarifying";
      if (["permission-needed", "error", "inserted", "idle"].includes(message.state)) {
        this.recording = false;
        if (this.timer) { window.clearInterval(this.timer); this.timer = undefined; }
      }
      this.ui.setState(message.state, message.detail);
      return;
    }

    // A pending result explicitly restored by content-script is authoritative
    // after a page reload. Runtime messages, however, must belong to the
    // currently active operation; never let an older clarity/result response
    // interrupt a newer recording.
    if (!fromPendingResult && this.activeOperationId && message.operationId !== this.activeOperationId) return;
    if (!fromPendingResult && !this.activeOperationId && message.operationId !== this.last?.result.operationId) return;
    if (message.type === "RAW_TRANSCRIPT") { this.activePhase = "refining"; this.ui.setState("refining", "Refining prompt…"); return; }
    if (message.type === "RESULT") {
      this.recording = false;
      if (this.timer) { window.clearInterval(this.timer); this.timer = undefined; }
      this.last = { result: { operationId: message.operationId, raw: message.raw, refined: message.refined } };
      this.activeOperationId = undefined;
      this.activeContextExport = undefined;
      const insertion = this.adapter.appendText(message.refined);
      if (!insertion) {
        this.activePhase = "error";
        this.ui.setState("error", "Composer not found — use Copy refined prompt");
        this.ui.showResultActions({ show: true, showPromptCopy: true, showMakeClearer: true, showRaw: Boolean(message.raw) });
        return;
      }
      this.last.insertion = insertion;
      this.activePhase = "inserted";
      this.ui.setState("inserted");
      this.ui.showResultActions({ show: true, showPromptCopy: true, showMakeClearer: true, showUndo: true, showRaw: true });
      await chrome.runtime.sendMessage({ type: "CLEAR_PENDING_RESULT" });
      return;
    }
    if (message.type === "RESULT_ERROR") {
      this.recording = false;
      if (this.timer) { window.clearInterval(this.timer); this.timer = undefined; }
      this.last = { result: { operationId: message.operationId, raw: message.raw, error: { code: message.code, message: message.message } } };
      this.activeOperationId = undefined;
      this.activeContextExport = undefined;
      this.activePhase = "error";
      this.ui.setState("error", message.message);
      const contextError = message.code === "missing-groq-key" || message.code === "invalid-groq-key" || message.code === "chat-context-failed" || message.code === "chat-context-unavailable";
      this.ui.showResultActions({ show: true, showGeminiSetup: message.code === "missing-key" || message.code === "invalid-key", showGroqSetup: contextError && (message.code === "missing-groq-key" || message.code === "invalid-groq-key"), showRaw: Boolean(message.raw), showContextRetry: contextError && Boolean(message.raw), showRefineWithoutContext: contextError && Boolean(message.raw) });
      return;
    }
    if (message.type === "CLARIFIED_RESULT") {
      if (!this.last?.result.refined) return;
      this.last.clarified = message.clarified;
      this.activePhase = "inserted";
      this.ui.setState("inserted", "Clearer version ready");
      this.ui.showResultActions({ show: true, showClearerReady: true, showPromptCopy: true, showUndo: Boolean(this.last.insertion), showRaw: Boolean(this.last.result.raw) });
      return;
    }
    if (message.type === "CLARIFY_ERROR") {
      this.activePhase = "error";
      this.ui.setState("error", message.message);
      this.ui.showResultActions({ show: true, showMakeClearer: Boolean(this.last?.result.refined), showPromptCopy: Boolean(this.last?.result.refined), showUndo: Boolean(this.last?.insertion), showRaw: Boolean(this.last?.result.raw), showGeminiSetup: message.code === "missing-key" || message.code === "invalid-key" });
    }
  }

  private async handleAction(action: UIAction): Promise<void> {
    if (action === "configure" || action === "configure-groq") {
      try { const reply = await chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }); if (!reply?.ok) throw new Error("Settings could not be opened."); this.ui.setState("idle"); this.ui.showResultActions({ show: false }); }
      catch (error) { this.ui.setState("error", error instanceof Error ? error.message : "Open Prompt Pilot settings from the extension menu."); }
      return;
    }
    if (action === "dismiss") { this.ui.setState("idle"); this.ui.showResultActions({ show: false }); return; }
    if (action === "make-clearer") {
      const prompt = this.last?.result.refined;
      if (!prompt || this.activePhase === "clarifying") return;
      this.activePhase = "clarifying";
      this.ui.setState("clarifying", "Making prompt clearer…");
      try { await chrome.runtime.sendMessage({ type: "CLARIFY_PROMPT", operationId: this.last!.result.operationId, prompt }); }
      catch (error) { this.activePhase = "inserted"; this.ui.setState("error", error instanceof Error ? error.message : "Could not start the clarity pass."); }
      return;
    }
    if (action === "copy-clearer") { await this.copyText(this.last?.clarified, "✓ Clearer version copied"); return; }
    if (action === "keep-clearer") { this.last!.clarified = undefined; this.activePhase = "inserted"; this.ui.setState("inserted", "Kept current prompt"); this.ui.showResultActions({ show: true, showMakeClearer: true, showPromptCopy: Boolean(this.last?.result.refined), showUndo: Boolean(this.last?.insertion), showRaw: Boolean(this.last?.result.raw) }); return; }
    if (action === "apply-clearer") {
      const last = this.last;
      const clearer = last?.clarified;
      if (!clearer) return;
      const insertion = last.insertion;
      if (insertion && this.adapter.replaceExact(insertion.after, clearer)) {
        last.result.refined = clearer;
        last.insertion = { before: insertion.before, after: clearer, inserted: clearer };
        this.activePhase = "inserted";
        this.ui.setState("inserted", "✓ Clearer version applied");
        this.ui.showResultActions({ show: true, showMakeClearer: true, showPromptCopy: true, showUndo: true, showRaw: Boolean(last.result.raw) });
      } else if (!insertion) {
        const added = this.adapter.appendText(clearer);
        if (added) { last.result.refined = clearer; last.insertion = added; this.ui.setState("inserted", "✓ Clearer version inserted"); this.ui.showResultActions({ show: true, showMakeClearer: true, showPromptCopy: true, showUndo: true, showRaw: Boolean(last.result.raw) }); }
        else this.ui.setState("error", "Composer not found — use Copy clearer version");
      } else {
        this.ui.setState("error", "Composer was edited; clearer version was not applied");
        this.ui.showResultActions({ show: true, showClearerReady: true, showPromptCopy: true, showRaw: Boolean(last.result.raw) });
      }
      return;
    }
    if (action === "retry-context" || action === "refine-without-context") {
      const raw = this.last?.result.raw;
      if (!raw || !this.last) return;
      const context = action === "retry-context" ? this.adapter.exportConversation()?.text : undefined;
      if (action === "retry-context" && !context) { this.ui.setState("error", "Current ChatGPT conversation could not be exported."); return; }
      this.activeOperationId = this.last.result.operationId;
      this.activePhase = "refining";
      this.ui.setState("refining", action === "retry-context" ? "Retrying chat context…" : "Refining without chat context…");
      try { await chrome.runtime.sendMessage({ type: "REFINE_TRANSCRIPT", operationId: this.last.result.operationId, level: this.ui.selectedLevel, raw, includeChatContext: action === "retry-context", contextExport: context }); }
      catch (error) { this.ui.setState("error", error instanceof Error ? error.message : "Could not restart refinement."); }
      return;
    }
    const raw = this.last?.result.raw;
    if (action === "copy-prompt") { await this.copyText(this.last?.result.refined, "✓ Prompt copied"); return; }
    if (!raw) return;
    if (action === "copy") { await this.copyText(raw, "✓ Raw copied"); return; }
    if (action === "undo") {
      const insertion = this.last?.insertion;
      if (insertion && this.adapter.replaceExact(insertion.after, insertion.before)) this.ui.setState("inserted", "✓ Undone");
      else this.ui.setState("error", "Composer was edited; undo skipped");
      return;
    }
    const insertion = this.last?.insertion;
    if (insertion && this.adapter.replaceExact(insertion.after, insertion.before + (insertion.before.trim() ? "\n\n" : "") + raw)) this.ui.setState("inserted", "✓ Raw inserted");
    else if (!insertion) {
      const rawInsertion = this.adapter.appendText(raw);
      if (rawInsertion) { this.last!.insertion = rawInsertion; this.ui.setState("inserted", "✓ Raw inserted"); }
      else this.ui.setState("error", "Composer not found — click to copy");
    }
  }

  private async copyText(text: string | undefined, success: string): Promise<void> {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); this.ui.setState("inserted", success); }
    catch { this.ui.setState("error", "Copy was blocked by the browser"); }
  }

  private updateContextAvailability(): void { this.ui.setContextAvailability(this.deviceClass === "capable-desktop" && this.transcriptionMode !== "cloud", this.groqConfigured); }
  private async refreshSettings(): Promise<void> {
    try {
      const [groqReply, modeReply] = await Promise.all([
        chrome.runtime.sendMessage({ type: "GET_GROQ_KEY_STATUS" }),
        chrome.runtime.sendMessage({ type: "GET_TRANSCRIPTION_MODE" }),
      ]);
      this.groqConfigured = groqReply?.available === true;
      if (modeReply?.transcriptionMode === "local" || modeReply?.transcriptionMode === "cloud" || modeReply?.transcriptionMode === "auto") this.transcriptionMode = modeReply.transcriptionMode;
      this.updateContextAvailability();
    } catch { /* settings may be unavailable during extension reload */ }
  }
  private async refreshGroqStatus(): Promise<void> { await this.refreshSettings(); }
}
