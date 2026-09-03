import { RecordingController } from "./recording-controller";
import type { ProgressMessage } from "../shared/types";

const controller = new RecordingController();
let observerTimer: number | undefined;

function mount(): void {
  if (observerTimer) window.clearTimeout(observerTimer);
  observerTimer = window.setTimeout(() => controller.mount(), 50);
}

const observer = new MutationObserver(mount);
observer.observe(document.documentElement, { childList: true, subtree: true });
mount();

chrome.runtime.onMessage.addListener((message: ProgressMessage | { type: "COMMAND_TOGGLE" }) => {
  if (message.type === "COMMAND_TOGGLE") {
    void controller.toggleRecording();
    return;
  }
  void controller.handleMessage(message);
});

void chrome.runtime.sendMessage({ type: "GET_PENDING_RESULT" }).then((reply) => {
  if (!reply?.result) return;
  if (reply.result.refined) void controller.handleMessage({ type: "RESULT", ...reply.result }, true);
  else if (reply.result.error) void controller.handleMessage({ type: "RESULT_ERROR", ...reply.result.error, operationId: reply.result.operationId, raw: reply.result.raw }, true);
});
