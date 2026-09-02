import type { ProcessingLevel } from "../shared/config";
import type { OperationResult, ProgressMessage } from "../shared/types";
import { ChatGPTAdapter, type InsertionRecord } from "./chatgpt-adapter";
import { PromptPilotUI } from "./injected-ui";

export class RecordingController {
  readonly adapter = new ChatGPTAdapter();
  readonly ui: PromptPilotUI;
  private timer?: number;
  private startedAt = 0;
  private last?: { result: OperationResult; insertion?: InsertionRecord };

  constructor() {
    this.ui = new PromptPilotUI(() => void this.toggleRecording(), (action) => void this.handleAction(action));
    void chrome.runtime.sendMessage({ type: "GET_PROCESSING_LEVEL" }).then(({ processingLevel }) => {
      if (processingLevel === 1 || processingLevel === 2 || processingLevel === 3) this.ui.selectedLevel = processingLevel;
    }).catch(() => undefined);
    void chrome.runtime.sendMessage({ type: "GET_SHORTCUT" }).then((reply) => this.ui.setShortcut(reply?.shortcut ?? "")).catch(() => undefined);
  }

  mount(): boolean { return this.adapter.mountControls(this.ui.host); }

  async toggleRecording(): Promise<void> {
    if (this.timer) {
      window.clearInterval(this.timer); this.timer = undefined;
      this.ui.setState("transcribing");
    } else {
      this.startedAt = Date.now();
      this.ui.setState("recording");
      this.timer = window.setInterval(() => this.ui.setTimer(Math.floor((Date.now() - this.startedAt) / 1000)), 1000);
    }
    await chrome.runtime.sendMessage({ type: "TOGGLE_RECORDING", level: this.ui.selectedLevel });
  }

  async handleMessage(message: ProgressMessage): Promise<void> {
    if (message.type === "STATE") {
      if (["permission-needed", "error", "inserted", "idle"].includes(message.state) && this.timer) {
        window.clearInterval(this.timer);
        this.timer = undefined;
      }
      this.ui.setState(message.state, message.detail);
    }
    if (message.type === "RAW_TRANSCRIPT") this.ui.setState("refining");
    if (message.type === "RESULT") {
      this.last = { result: { operationId: message.operationId, raw: message.raw, refined: message.refined } };
      const insertion = this.adapter.appendText(message.refined);
      if (!insertion) {
        this.ui.setState("error", "Composer not found — click to copy");
        this.ui.showResultActions(true, false, true, false, true);
        return;
      }
      this.last.insertion = insertion;
      this.ui.setState("inserted");
      this.ui.showResultActions(true, false, true, true, true);
      await chrome.runtime.sendMessage({ type: "CLEAR_PENDING_RESULT" });
    }
    if (message.type === "RESULT_ERROR") {
      if (this.timer) { window.clearInterval(this.timer); this.timer = undefined; }
      this.last = { result: { operationId: message.operationId, raw: message.raw, error: { code: message.code, message: message.message } } };
      this.ui.setState("error", message.message);
      const needsGeminiSetup = message.code === "missing-key" || message.code === "invalid-key";
      this.ui.showResultActions(true, needsGeminiSetup, false, false, Boolean(message.raw));
    }
  }

  private async handleAction(action: "undo" | "raw" | "copy" | "copy-prompt" | "configure" | "dismiss"): Promise<void> {
    if (action === "configure") {
      try {
        const reply = await chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
        if (!reply?.ok) throw new Error("Settings could not be opened.");
        this.ui.setState("idle");
        this.ui.showResultActions(false);
      } catch (error) {
        this.ui.setState("error", error instanceof Error ? error.message : "Open Prompt Pilot settings from the extension menu.");
      }
      return;
    }
    if (action === "dismiss") {
      this.ui.setState("idle");
      this.ui.showResultActions(false);
      return;
    }
    const raw = this.last?.result.raw;
    if (action === "copy-prompt") {
      const prompt = this.last?.result.refined;
      if (!prompt) return;
      try { await navigator.clipboard.writeText(prompt); this.ui.setState("inserted", "✓ Prompt copied"); }
      catch { this.ui.setState("error", "Copy was blocked by the browser"); }
      return;
    }
    if (!raw) return;
    if (action === "copy") {
      try { await navigator.clipboard.writeText(raw); this.ui.setState("inserted", "✓ Raw copied"); }
      catch { this.ui.setState("error", "Copy was blocked by the browser"); }
      return;
    }
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
}
