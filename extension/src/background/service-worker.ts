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
import type { DeviceClass, TranscriptionMode } from "../shared/device-capabilities";
import { GeminiTranscriber } from "./gemini-transcriber";
import { GroqContextCondenser } from "./groq-context-condenser";
import type { ActiveOperation } from "./operation-coordinator";
import { RefinerError } from "../shared/errors";
import { acceptsEngineProgress } from "../shared/operation-phase";

const refiner = new GeminiRefiner(async () => {
  const stored = await chrome.storage.local.get("geminiApiKey");
  return typeof stored.geminiApiKey === "string" ? stored.geminiApiKey : undefined;
});
const transcriber = new GeminiTranscriber(async () => {
  const stored = await chrome.storage.local.get("geminiApiKey");
  return typeof stored.geminiApiKey === "string" ? stored.geminiApiKey : undefined;
});
const contextCondenser = new GroqContextCondenser(async () => {
  const stored = await chrome.storage.local.get("groqApiKey");
  return typeof stored.groqApiKey === "string" ? stored.groqApiKey : undefined;
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
    const transcriptionMode = message.transcriptionMode === "local" || message.transcriptionMode === "cloud" ? message.transcriptionMode : "auto";
    const deviceClass = message.deviceClass === "constrained-desktop" ? "constrained-desktop" : "capable-desktop";
    void toggleRecording(sender.tab.id, level as ProcessingLevel, transcriptionMode as TranscriptionMode, deviceClass as DeviceClass, typeof message.chatContextExport === "string" ? message.chatContextExport : undefined, message.includeChatContext === true).catch((error) => {
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

  if (message.type === "GET_TRANSCRIPTION_MODE") {
    void chrome.storage.local.get("transcriptionMode").then(({ transcriptionMode }) => sendResponse({ transcriptionMode: transcriptionMode === "local" || transcriptionMode === "cloud" ? transcriptionMode : "auto" }));
    return true;
  }

  if (message.type === "SET_TRANSCRIPTION_MODE") {
    const mode = message.mode === "local" || message.mode === "cloud" ? message.mode : "auto";
    void chrome.storage.local.set({ transcriptionMode: mode }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "SET_PROCESSING_LEVEL") {
    const level = message.level === 1 || message.level === 2 || message.level === 3 ? message.level : 2;
    void chrome.storage.local.set({ processingLevel: level }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "GET_GROQ_KEY_STATUS") {
    void chrome.storage.local.get("groqApiKey").then(({ groqApiKey }) => sendResponse({ available: typeof groqApiKey === "string" && Boolean(groqApiKey.trim()) }));
    return true;
  }

  if (message.type === "REFINE_TRANSCRIPT" && sender.tab?.id) {
    const level = message.level === 1 || message.level === 2 || message.level === 3 ? message.level : 2;
    sendResponse({ ok: true });
    void processTranscript({
      id: message.operationId as string,
      tabId: sender.tab.id,
      level,
      chatContextExport: typeof message.contextExport === "string" ? message.contextExport : undefined,
      chatContextRequested: message.includeChatContext === true,
      phase: "transcribing",
    }, message.raw as string);
    return false;
  }

  if (message.type === "CLARIFY_PROMPT" && sender.tab?.id) {
    sendResponse({ ok: true });
    void processClarification({ id: message.operationId as string, tabId: sender.tab.id }, message.prompt as string);
    return false;
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
    if (!acceptsEngineProgress(operation.phase)) return;
    sendProgress(operation.tabId, { type: "STATE", operationId: operation.id, state: operation.phase === "recording" ? "recording" : "transcribing", detail: typeof message.detail === "string" ? message.detail : "Loading local model…" });
    return;
  }
  if (message.type === "ENGINE_STATE" && operation && message.operationId === operation.id) {
    if (operation.phase !== "recording" && operation.phase !== "transcribing") return;
    operation.phase = "transcribing";
    sendProgress(operation.tabId, { type: "STATE", operationId: operation.id, state: "transcribing" });
    return;
  }
  if (message.type === "ENGINE_TRANSCRIPT" && operation && message.operationId === operation.id) {
    if (operation.phase !== "transcribing" || operation.transcriptProcessed) return;
    operation.phase = "refining";
    operation.transcriptProcessed = true;
    const raw = typeof message.raw === "string" ? message.raw : "";
    void processTranscript(operation, raw);
  }
  if (message.type === "ENGINE_AUDIO" && operation && message.operationId === operation.id) {
    if (operation.phase !== "transcribing" || operation.transcriptProcessed) return;
    operation.transcriptProcessed = true;
    if (message.audio instanceof ArrayBuffer) void processAudio(operation, message.audio, typeof message.mimeType === "string" ? message.mimeType : "audio/webm");
  }
  if (message.type === "ENGINE_FAILURE" && operation && message.operationId === operation.id) {
    const code = typeof message.code === "string" ? message.code : "transcription-error";
    const detail = typeof message.message === "string" ? message.message : "Local transcription failed.";
    if (code === "microphone") {
      sendProgress(operation.tabId, { type: "STATE", operationId: operation.id, state: "permission-needed", detail: "Enable microphone access in Prompt Pilot settings." });
    } else {
      sendProgress(operation.tabId, { type: "RESULT_ERROR", operationId: operation.id, raw: "", code, message: detail });
    }
    finishOperation(operation.id, "error");
  }
});

async function processTranscript(operation: Pick<ActiveOperation, "id" | "tabId" | "level" | "chatContextExport" | "chatContextBrief" | "chatContextRequested" | "phase">, raw: string): Promise<void> {
  sendProgress(operation.tabId, { type: "RAW_TRANSCRIPT", operationId: operation.id, raw });
  if (operation.chatContextRequested) sendProgress(operation.tabId, { type: "STATE", operationId: operation.id, state: "refining", detail: "Condensing current chat context…" });
  else sendProgress(operation.tabId, { type: "STATE", operationId: operation.id, state: "refining", detail: "Refining prompt…" });
  let succeeded = false;
  try {
    if (!raw.trim()) throw new RefinerError("api-error", "No speech was detected. Try recording again.");
    let contextBrief: string | undefined = operation.chatContextBrief;
    if (operation.chatContextRequested) {
      if (!operation.chatContextExport?.trim()) throw new RefinerError("chat-context-unavailable", "Current ChatGPT conversation could not be exported. Refine without context or try again.");
      contextBrief = await contextCondenser.condense(operation.chatContextExport);
      if ("chatContextBrief" in operation) operation.chatContextBrief = contextBrief;
      sendProgress(operation.tabId, { type: "STATE", operationId: operation.id, state: "refining", detail: "Refining prompt with chat context…" });
    }
    const refined = await refiner.refine(raw, operation.level, contextBrief);
    const result = { operationId: operation.id, raw, refined };
    savePendingResult(operation.tabId, result);
    sendProgress(operation.tabId, { type: "RESULT", ...result });
    succeeded = true;
  } catch (error) {
    const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "api-error";
    const detail = error instanceof Error ? error.message : "Refinement failed. Your raw transcript is still available.";
    const result = { operationId: operation.id, raw, error: { code, message: detail } };
    savePendingResult(operation.tabId, result);
    sendProgress(operation.tabId, { type: "RESULT_ERROR", operationId: operation.id, raw, code, message: detail });
  } finally {
    finishOperation(operation.id, succeeded ? "complete" : "error");
  }
}

async function processAudio(operation: Pick<ActiveOperation, "id" | "tabId" | "level" | "chatContextExport" | "chatContextRequested" | "phase">, audio: ArrayBuffer, mimeType: string): Promise<void> {
  sendProgress(operation.tabId, { type: "STATE", operationId: operation.id, state: "transcribing", detail: "Transcribing audio in the cloud…" });
  try {
    const raw = await transcriber.transcribe(audio, mimeType || "audio/webm");
    await processTranscript(operation, raw);
  } catch (error) {
    const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "api-error";
    const message = error instanceof Error ? error.message : "Cloud transcription failed. Your recording could not be transcribed.";
    savePendingResult(operation.tabId, { operationId: operation.id, raw: "", error: { code, message } });
    sendProgress(operation.tabId, { type: "RESULT_ERROR", operationId: operation.id, raw: "", code, message });
    finishOperation(operation.id, "error");
  }
}

async function processClarification(operation: { id: string; tabId: number }, prompt: string): Promise<void> {
  sendProgress(operation.tabId, { type: "STATE", operationId: operation.id, state: "clarifying", detail: "Making prompt clearer…" });
  try {
    const clarified = await refiner.clarify(prompt);
    sendProgress(operation.tabId, { type: "CLARIFIED_RESULT", operationId: operation.id, clarified });
  } catch (error) {
    const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "api-error";
    const message = error instanceof Error ? error.message : "Could not make the prompt clearer.";
    sendProgress(operation.tabId, { type: "CLARIFY_ERROR", operationId: operation.id, code, message });
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
