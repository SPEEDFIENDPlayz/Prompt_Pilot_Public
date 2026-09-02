import { OFFSCREEN_PATH, type ProcessingLevel } from "../shared/config";
import type { OperationResult, ProgressMessage } from "../shared/types";

let offscreenReady: Promise<void> | undefined;
let currentOperation: { id: string; tabId: number; level: ProcessingLevel } | undefined;
const pendingResults = new Map<number, OperationResult>();

async function ensureOffscreen(): Promise<void> {
  if (offscreenReady) return offscreenReady;
  offscreenReady = (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
    });
    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ["USER_MEDIA", "BLOBS", "WORKERS"],
        justification: "Record microphone audio and run local Whisper transcription.",
      });
    }
  })().catch((error) => {
    offscreenReady = undefined;
    throw error;
  });
  return offscreenReady;
}

function sendToTab(tabId: number, message: ProgressMessage): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
}

export async function toggleRecording(tabId: number, level: ProcessingLevel): Promise<void> {
  await ensureOffscreen();
  if (!currentOperation) {
    const operationId = crypto.randomUUID();
    currentOperation = { id: operationId, tabId, level };
    sendToTab(tabId, { type: "STATE", operationId, state: "recording" });
    await chrome.runtime.sendMessage({ type: "ENGINE_START", operationId });
    return;
  }
  if (currentOperation.tabId !== tabId) return;
  sendToTab(tabId, { type: "STATE", operationId: currentOperation.id, state: "transcribing" });
  await chrome.runtime.sendMessage({ type: "ENGINE_STOP", operationId: currentOperation.id });
}

export function savePendingResult(tabId: number, result: OperationResult): void {
  pendingResults.set(tabId, result);
}

export function takePendingResult(tabId: number): OperationResult | undefined {
  return pendingResults.get(tabId);
}

export function clearPendingResult(tabId: number): void {
  pendingResults.delete(tabId);
}

export function finishOperation(operationId: string): void {
  if (currentOperation?.id === operationId) currentOperation = undefined;
}

export function getCurrentOperation(): typeof currentOperation {
  return currentOperation;
}
