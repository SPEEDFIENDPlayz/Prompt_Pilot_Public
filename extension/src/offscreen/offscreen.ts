import { MicrophoneRecorder, blobTo16kMono } from "./recorder";
import { transcribe, warmup } from "./whisper-transcriber";
import { BufferedWhisperSession } from "./buffered-transcriber";

const recorder = new MicrophoneRecorder();
let activeOperationId: string | undefined;
let activeUseCloud = false;
let activeAllowCloudFallback = false;
let activeProfile: "capable" | "constrained" = "capable";
let bufferedSession: BufferedWhisperSession | undefined;

chrome.runtime.onMessage.addListener((message: Record<string, unknown>, _sender, sendResponse) => {
  if (message.type === "ENGINE_START" && typeof message.operationId === "string") {
    sendResponse({ ok: true });
    activeUseCloud = message.useCloud === true;
    activeAllowCloudFallback = message.allowCloudFallback === true;
    activeProfile = message.captureProfile === "constrained" ? "constrained" : "capable";
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
    const profile = activeProfile === "constrained" ? (await import("../shared/config")).AUDIO_CAPTURE_PROFILES.constrained : (await import("../shared/config")).AUDIO_CAPTURE_PROFILES.capable;
    await recorder.start(profile);
    // Model download/initialization overlaps the user's speaking time.
    if (!activeUseCloud) {
      warmup(operationId);
      if (activeProfile === "capable" && recorder.mediaStream) {
        const session = new BufferedWhisperSession(operationId);
        try {
          await session.start(recorder.mediaStream);
          bufferedSession = session;
        } catch (error) {
          console.warn("[Prompt Pilot] Background chunk transcription unavailable; using post-recording Whisper", error);
          bufferedSession = undefined;
        }
      }
    }
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
    if (activeUseCloud) {
      bufferedSession = undefined;
      notify({ type: "ENGINE_AUDIO", operationId, audio: await blob.arrayBuffer(), mimeType: blob.type || "audio/webm" });
    } else {
      const backgroundText = bufferedSession ? await bufferedSession.stop() : "";
      bufferedSession = undefined;
      if (backgroundText) {
        notify({ type: "ENGINE_TRANSCRIPT", operationId, raw: backgroundText });
        return;
      }
      const audio = await blobTo16kMono(blob);
      try {
        const raw = await transcribe(audio, operationId);
        notify({ type: "ENGINE_TRANSCRIPT", operationId, raw });
      } catch (error) {
        if (activeAllowCloudFallback) notify({ type: "ENGINE_AUDIO", operationId, audio: await blob.arrayBuffer(), mimeType: blob.type || "audio/webm", fallback: true });
        else throw error;
      }
    }
  } catch (error) {
    notify({ type: "ENGINE_FAILURE", operationId, code: "transcription", message: error instanceof Error ? error.message : "Local transcription failed." });
  } finally {
    activeOperationId = undefined;
  }
}
