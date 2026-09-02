import { MicrophoneRecorder, blobTo16kMono } from "./recorder";
import { transcribe, warmup } from "./whisper-transcriber";

const recorder = new MicrophoneRecorder();
let activeOperationId: string | undefined;

chrome.runtime.onMessage.addListener((message: Record<string, unknown>, _sender, sendResponse) => {
  if (message.type === "ENGINE_START" && typeof message.operationId === "string") {
    sendResponse({ ok: true });
    void start(message.operationId);
    return false;
  } else if (message.type === "ENGINE_STOP" && typeof message.operationId === "string") {
    sendResponse({ ok: true });
    void stop(message.operationId);
    return false;
  }
  return false;
});

function notify(message: Record<string, unknown>): void {
  void chrome.runtime.sendMessage(message).catch(() => undefined);
}

async function start(operationId: string): Promise<void> {
  if (activeOperationId) return;
  activeOperationId = operationId;
  try {
    await recorder.start();
    // Model download/initialization overlaps the user's speaking time.
    warmup(operationId);
    notify({ type: "ENGINE_STARTED", operationId });
  } catch (error) {
    activeOperationId = undefined;
    notify({ type: "ENGINE_FAILURE", operationId, code: "microphone", message: error instanceof Error ? error.message : "Microphone permission is required." });
  }
}

async function stop(operationId: string): Promise<void> {
  if (activeOperationId !== operationId) return;
  try {
    const blob = await recorder.stop();
    notify({ type: "ENGINE_STATE", operationId, state: "transcribing" });
    const audio = await blobTo16kMono(blob);
    const raw = await transcribe(audio, operationId);
    notify({ type: "ENGINE_TRANSCRIPT", operationId, raw });
  } catch (error) {
    notify({ type: "ENGINE_FAILURE", operationId, code: "transcription", message: error instanceof Error ? error.message : "Local transcription failed." });
  } finally {
    activeOperationId = undefined;
  }
}
