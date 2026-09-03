import { OFFSCREEN_PATH, type ProcessingLevel } from "../shared/config";
import type { OperationResult, ProgressMessage } from "../shared/types";
import type { DeviceClass, TranscriptionMode } from "../shared/device-capabilities";
import { shouldUseCloud } from "../shared/device-capabilities";
import type { OperationPhase } from "../shared/operation-phase";

export type { OperationPhase } from "../shared/operation-phase";

let offscreenReady: Promise<void> | undefined;
export interface ActiveOperation {
  id: string;
  tabId: number;
  level: ProcessingLevel;
  transcriptionMode: TranscriptionMode;
  deviceClass: DeviceClass;
  useCloud: boolean;
  allowCloudFallback: boolean;
  phase: OperationPhase;
  chatContextExport?: string;
  chatContextBrief?: string;
  chatContextRequested: boolean;
  transcriptProcessed: boolean;
}
let currentOperation: ActiveOperation | undefined;
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

export async function toggleRecording(tabId: number, level: ProcessingLevel, transcriptionMode: TranscriptionMode = "auto", deviceClass: DeviceClass = "capable-desktop", chatContextExport?: string, includeChatContext = false): Promise<void> {
  await ensureOffscreen();
  if (!currentOperation) {
    const operationId = crypto.randomUUID();
    const useCloud = shouldUseCloud(transcriptionMode, deviceClass);
    currentOperation = { id: operationId, tabId, level, transcriptionMode, deviceClass, useCloud, allowCloudFallback: transcriptionMode === "auto", phase: "recording", chatContextExport, chatContextRequested: includeChatContext, transcriptProcessed: false };
    sendToTab(tabId, { type: "STATE", operationId, state: "recording" });
    try {
      await chrome.runtime.sendMessage({ type: "ENGINE_START", operationId, useCloud, allowCloudFallback: currentOperation.allowCloudFallback, captureProfile: useCloud || deviceClass === "constrained-desktop" ? "constrained" : "capable" });
    } catch (error) {
      finishOperation(operationId, "error");
      throw error;
    }
    return;
  }
  if (currentOperation.tabId !== tabId) return;
  if (currentOperation.phase !== "recording") return;
  currentOperation.phase = "transcribing";
  sendToTab(tabId, { type: "STATE", operationId: currentOperation.id, state: "transcribing", detail: "Finalizing transcript…" });
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

export function finishOperation(operationId: string, phase: OperationPhase = "complete"): void {
  if (currentOperation?.id === operationId) {
    currentOperation.phase = phase;
    currentOperation = undefined;
  }
}

export function getCurrentOperation(): typeof currentOperation {
  return currentOperation;
}
