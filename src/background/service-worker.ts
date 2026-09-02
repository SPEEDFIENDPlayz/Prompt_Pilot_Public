import { GeminiRefiner } from "./gemini-refiner";
import {
  clearPendingResult,
  finishOperation,
  getCurrentOperation,
  savePendingResult,
  takePendingResult,
  toggleRecording,
} from "./operation-coordinator";
import type { ClientMessage, ProgressMessage } from "../shared/types";
import type { ProcessingLevel } from "../shared/config";

const refiner = new GeminiRefiner(async () => {
  const stored = await chrome.storage.local.get("geminiApiKey");
  return typeof stored.geminiApiKey === "string" ? stored.geminiApiKey : undefined;
});

void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

chrome.action.onClicked.addListener(() => {
  void openOptionsPage();
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "toggle-recording" || !tab?.id || !tab.url?.startsWith("https://chatgpt.com/")) return;
  // Route through the content controller so the command and mic button share
  // the same toggleRecording() implementation and timer/UI behavior.
  await chrome.tabs.sendMessage(tab.id, { type: "COMMAND_TOGGLE" }).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message: ClientMessage | Record<string, unknown>, sender, sendResponse) => {
  if (message.type === "ENGINE_START" || message.type === "ENGINE_STOP") return false;

  if (message.type === "TOGGLE_RECORDING" && sender.tab?.id) {
    const level = message.level === 1 || message.level === 2 || message.level === 3 ? message.level : 2;
    void toggleRecording(sender.tab.id, level as ProcessingLevel).catch((error) => {
      const detail = error instanceof Error ? error.message : "Set up microphone access in Prompt Pilot settings first.";
      void chrome.tabs.sendMessage(sender.tab!.id!, {
        type: "STATE",
        operationId: "permission-error",
        state: "permission-needed",
        detail,
      } satisfies ProgressMessage);
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "GET_SHORTCUT") {
    void chrome.commands.getAll().then((commands) => {
      sendResponse({ shortcut: commands.find((command) => command.name === "toggle-recording")?.shortcut || "Not assigned" });
    });
    return true;
  }

  if (message.type === "GET_PROCESSING_LEVEL") {
    void chrome.storage.local.get("processingLevel").then(({ processingLevel }) => {
      const level = processingLevel === 1 || processingLevel === 2 || processingLevel === 3 ? processingLevel : 2;
      sendResponse({ processingLevel: level });
    });
    return true;
  }

  if (message.type === "SET_PROCESSING_LEVEL") {
    const level = message.level === 1 || message.level === 2 || message.level === 3 ? message.level : 2;
    void chrome.storage.local.set({ processingLevel: level }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "OPEN_OPTIONS") {
    void openOptionsPage().then((ok) => sendResponse({ ok }));
    return true;
  }

  if (message.type === "GET_PENDING_RESULT" && sender.tab?.id) {
    sendResponse({ result: takePendingResult(sender.tab.id) ?? null });
    return false;
  }
  if (message.type === "CLEAR_PENDING_RESULT" && sender.tab?.id) {
    clearPendingResult(sender.tab.id);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

chrome.runtime.onMessage.addListener((message: Record<string, unknown>) => {
  const operation = getCurrentOperation();
  if (message.type === "ENGINE_PROGRESS" && operation && message.operationId === operation.id) {
    sendProgress(operation.tabId, { type: "STATE", operationId: operation.id, state: "transcribing", detail: typeof message.detail === "string" ? message.detail : "Loading Whisper…" });
    return;
  }
  if (message.type === "ENGINE_STATE" && operation && message.operationId === operation.id) {
    sendProgress(operation.tabId, { type: "STATE", operationId: operation.id, state: "transcribing" });
    return;
  }
  if (message.type === "ENGINE_TRANSCRIPT" && operation && message.operationId === operation.id) {
    const raw = typeof message.raw === "string" ? message.raw : "";
    void processTranscript(operation, raw);
  }
  if (message.type === "ENGINE_FAILURE" && operation && message.operationId === operation.id) {
    const code = typeof message.code === "string" ? message.code : "transcription-error";
    const detail = typeof message.message === "string" ? message.message : "Local transcription failed.";
    if (code === "microphone") {
      sendProgress(operation.tabId, { type: "STATE", operationId: operation.id, state: "permission-needed", detail: "Enable microphone access in Prompt Pilot settings." });
    } else {
      sendProgress(operation.tabId, { type: "RESULT_ERROR", operationId: operation.id, raw: "", code, message: detail });
    }
    finishOperation(operation.id);
  }
});

async function processTranscript(operation: { id: string; tabId: number; level: ProcessingLevel }, raw: string): Promise<void> {
  sendProgress(operation.tabId, { type: "RAW_TRANSCRIPT", operationId: operation.id, raw });
  sendProgress(operation.tabId, { type: "STATE", operationId: operation.id, state: "refining" });
  try {
    const refined = await refiner.refine(raw, operation.level);
    const result = { operationId: operation.id, raw, refined };
    savePendingResult(operation.tabId, result);
    sendProgress(operation.tabId, { type: "RESULT", ...result });
  } catch (error) {
    const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "api-error";
    const detail = error instanceof Error ? error.message : "Refinement failed. Your raw transcript is still available.";
    const result = { operationId: operation.id, raw, error: { code, message: detail } };
    savePendingResult(operation.tabId, result);
    sendProgress(operation.tabId, { type: "RESULT_ERROR", operationId: operation.id, raw, code, message: detail });
  } finally {
    finishOperation(operation.id);
  }
}

function sendProgress(tabId: number, message: ProgressMessage): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
}

async function openOptionsPage(): Promise<boolean> {
  try {
    if (typeof chrome.runtime.openOptionsPage === "function") {
      await chrome.runtime.openOptionsPage();
    } else {
      await chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html") });
    }
    return true;
  } catch (error) {
    console.error("[Prompt Pilot] Could not open settings page", error);
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html") });
      return true;
    } catch (fallbackError) {
      console.error("[Prompt Pilot] Settings tab fallback failed", fallbackError);
      return false;
    }
  }
}
