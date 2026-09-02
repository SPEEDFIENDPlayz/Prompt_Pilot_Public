import "./styles.css";
import { blobTo16kMono } from "./audio/audio-processing";
import { MobileRecorder } from "./audio/recorder";
import { AUDIO_CAPTURE_PROFILES, DEFAULT_LEVEL } from "./core/config";
import { detectDeviceCapabilities, shouldUseCloud, type DeviceCapabilities } from "./core/device-capabilities";
import { RefinerError } from "./core/errors";
import { GeminiRefiner } from "./core/gemini-refiner";
import type { AppPhase, ProcessingLevel, Timings, TranscriptionMode } from "./core/types";
import { registerServiceWorker } from "./pwa/register-service-worker";
import { loadSettings, saveSettings, type Settings } from "./storage/settings-store";
import { warmTranscriber } from "./transcription/transcriber";
import { TranscriptionRouter } from "./transcription/router";
import { BufferedWhisperSession } from "./transcription/chunked-local";
import { copyText } from "./ui/clipboard";
import { mainScreen, phoneScreen, setupScreen } from "./ui/screens";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Prompt Pilot could not start.");
const root = app;

let settings: Settings;
let capabilities: DeviceCapabilities;
let phase: AppPhase = "setup";
let level: ProcessingLevel = DEFAULT_LEVEL;
let rawTranscript = "";
let recorder: MobileRecorder | undefined;
let bufferedSession: BufferedWhisperSession | undefined;
let pendingAudio: Blob | undefined;
let timer: number | undefined;
let recordStartedAt = 0;
const timings: Timings = {};

const refiner = new GeminiRefiner(async () => settings?.geminiApiKey);
const transcriptionRouter = new TranscriptionRouter(async () => settings?.geminiApiKey);

function elapsed(seconds: number): string { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
function now(): number { return performance.now(); }

function renderSetup(): void {
  phase = "setup";
  root.innerHTML = setupScreen();
  const input = document.querySelector<HTMLInputElement>("#api-key")!;
  document.querySelector<HTMLButtonElement>("#save-setup")!.addEventListener("click", async () => {
    const key = input.value.trim();
    if (!key) { input.setCustomValidity("Add your Gemini API key to continue."); input.reportValidity(); return; }
    input.setCustomValidity("");
    settings = await saveSettings({ geminiApiKey: key, introSeen: true });
    renderApp();
  });
}

function status(message: string, detail = ""): void {
  document.querySelector<HTMLElement>("#status")!.textContent = message;
  document.querySelector<HTMLElement>("#detail")!.textContent = detail;
}

function resultArea(): HTMLTextAreaElement { return document.querySelector<HTMLTextAreaElement>("#prompt-output")!; }
function showResult(text: string): void {
  const section = document.querySelector<HTMLElement>("#result")!;
  section.hidden = false;
  resultArea().value = text;
}
function hideResult(): void { document.querySelector<HTMLElement>("#result")!.hidden = true; }
function setMicEnabled(enabled: boolean): void { const mic = document.querySelector<HTMLButtonElement>("#mic"); if (mic) mic.disabled = !enabled; }
function selectMode(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-level]").forEach((button) => button.classList.toggle("selected", Number(button.dataset.level) === level));
}

function setPhase(next: AppPhase): void {
  phase = next;
  document.body.dataset.phase = next;
  const mic = document.querySelector<HTMLButtonElement>("#mic");
  mic?.classList.toggle("recording", next === "recording");
  mic?.setAttribute("aria-label", next === "recording" ? "Stop recording" : "Start recording");
}

function stopTimer(): void { if (timer) window.clearInterval(timer); timer = undefined; }

async function startRecording(): Promise<void> {
  rawTranscript = "";
  pendingAudio = undefined;
  hideResult();
  setRetryVisible(false);
  setPhase("recording");
  setMicEnabled(false);
  status("Starting microphone…", "Allow microphone access when Safari asks.");
  try {
    recorder = new MobileRecorder();
    const profile = capabilities.deviceClass === "constrained-desktop" ? AUDIO_CAPTURE_PROFILES.constrained : AUDIO_CAPTURE_PROFILES.capable;
    await recorder.start(profile);
    recordStartedAt = Date.now();
    status("Recording 0:00", "Tap again when you are done.");
    timer = window.setInterval(() => status(`Recording ${elapsed(Math.floor((Date.now() - recordStartedAt) / 1000))}`, "Tap again when you are done."), 250);
    // Warm the model while the user speaks. The active transcription request
    // joins the same worker load if the user stops before it is ready.
    if (!shouldUseCloud(settings.transcriptionMode, capabilities.deviceClass)) {
      warmTranscriber();
      if (capabilities.deviceClass === "capable-desktop" && recorder.mediaStream) {
        bufferedSession = new BufferedWhisperSession((detail) => status("Recording · processing in background", detail));
        try { await bufferedSession.start(recorder.mediaStream); }
        catch (error) { console.warn("[Prompt Pilot Mobile] Buffered transcription unavailable; using post-recording Whisper", error); bufferedSession = undefined; }
      }
    }
  } catch (error) {
    setPhase("error");
    const denied = error instanceof DOMException && error.name === "NotAllowedError";
    status(denied ? "Microphone access is required." : "Could not start recording.", denied ? "Enable microphone access for this site in Safari settings, then try again." : error instanceof Error ? error.message : "Try again.");
  } finally { setMicEnabled(true); }
}

async function stopRecording(): Promise<void> {
  if (!recorder) return;
  stopTimer();
  setPhase("finalizing");
  setMicEnabled(false);
  status("Preparing audio…", "Keeping your recording on this device.");
  const finalizedAt = now();
  try {
    const blob = await recorder.stop();
    recorder = undefined;
    timings.recordingFinalizationMs = now() - finalizedAt;
    pendingAudio = blob;
    await processAudioBlob(blob);
  } catch (error) {
    setPhase("error");
    const message = error instanceof Error ? error.message : "Prompt Pilot could not finish this recording.";
    if (rawTranscript) {
      showResult(rawTranscript);
      status(error instanceof RefinerError ? "Refinement unavailable" : "Transcription issue", "Your raw transcript is ready to copy or edit.");
    } else {
      showResult("");
      setRetryVisible(Boolean(pendingAudio));
      status(message === "No speech detected." ? message : "Could not transcribe recording.", message === "No speech detected." ? "Try recording again and speak a little longer." : message);
    }
    console.error("[Prompt Pilot Mobile] operation failed", error);
  } finally { setMicEnabled(true); }
}

function setRetryVisible(visible: boolean): void {
  document.querySelector<HTMLButtonElement>("#retry-processing")?.toggleAttribute("hidden", !visible);
}

async function processAudioBlob(blob: Blob): Promise<void> {
  rawTranscript = "";
  setRetryVisible(false);
  setPhase("transcribing");
  status("Transcribing…", "Loading the local speech model if needed.");
  const transcribedAt = now();
  const cloud = shouldUseCloud(settings.transcriptionMode, capabilities.deviceClass);
  if (cloud) status("Cloud transcription…", "Sending this temporary recording to Gemini.");
  const bufferedText = !cloud && bufferedSession ? await bufferedSession.stop() : "";
  bufferedSession = undefined;
  const pcm = cloud || bufferedText ? undefined : await blobTo16kMono(blob);
  const transcriptResult = bufferedText ? { text: bufferedText, provider: "local-whisper" as const } : await transcriptionRouter.transcribe({ audio: blob, pcm, deviceClass: capabilities.deviceClass, mode: settings.transcriptionMode }, (event) => {
    const percent = typeof event.progress === "number" ? ` ${Math.round(event.progress)}%` : "";
    status(`${cloud ? "Cloud transcription" : "Transcribing"}${percent}…`, event.detail ?? (cloud ? "Sending audio only for this recording." : "Working locally on this computer."));
  });
  rawTranscript = transcriptResult.text;
  timings.transcriptionMs = now() - transcribedAt;
  if (!rawTranscript) throw new Error("No speech detected.");
  setPhase("refining");
  status("Refining…", "Sending only the text transcript to Gemini.");
  const refinedAt = now();
  const refined = await refiner.refine(rawTranscript, level);
  timings.refinementMs = now() - refinedAt;
  setPhase("result");
  status("Your prompt is ready", "Review it, then copy it into ChatGPT.");
  showResult(refined);
  console.info("[Prompt Pilot Mobile] operation timings", timings);
}

function bindSettings(): void {
  const dialog = document.querySelector<HTMLDialogElement>("#settings-dialog")!;
  document.querySelector<HTMLButtonElement>("#settings")!.addEventListener("click", () => {
    document.querySelector<HTMLInputElement>("#settings-key")!.value = "";
    const select = document.querySelector<HTMLSelectElement>("#transcription-mode");
    if (select) select.value = settings.transcriptionMode;
    dialog.showModal();
  });
  document.querySelector<HTMLButtonElement>("#save-settings")!.addEventListener("click", async () => {
    const key = document.querySelector<HTMLInputElement>("#settings-key")!.value.trim();
    const mode = document.querySelector<HTMLSelectElement>("#transcription-mode")?.value as TranscriptionMode | undefined;
    settings = await saveSettings({ ...(key ? { geminiApiKey: key } : {}), ...(mode === "auto" || mode === "local" || mode === "cloud" ? { transcriptionMode: mode } : {}) });
    dialog.close();
  });
  document.querySelector<HTMLButtonElement>("#remove-key")!.addEventListener("click", async () => { settings = await saveSettings({ geminiApiKey: undefined, introSeen: false }); dialog.close(); renderSetup(); });
}

function bindMainEvents(): void {
  document.querySelector<HTMLButtonElement>("#mic")!.addEventListener("click", () => {
    if (phase === "recording") void stopRecording();
    else if (["ready", "result", "error"].includes(phase)) void startRecording();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-level]").forEach((button) => button.addEventListener("click", async () => {
    if (["recording", "finalizing", "transcribing", "refining"].includes(phase)) return;
    level = Number(button.dataset.level) as ProcessingLevel;
    settings = await saveSettings({ level });
    selectMode();
  }));
  document.querySelector<HTMLButtonElement>("#copy")!.addEventListener("click", async () => {
    const output = resultArea();
    const copied = await copyText(output.value, output);
    status(copied ? "✓ Copied" : "Select and copy manually", copied ? "Switch to ChatGPT and paste your prompt." : "Your prompt remains selected here.");
  });
  document.querySelector<HTMLButtonElement>("#use-raw")!.addEventListener("click", () => {
    if (!rawTranscript) return;
    resultArea().value = rawTranscript;
    status("Using raw transcript", "You can edit it or copy it now.");
  });
  document.querySelector<HTMLButtonElement>("#record-again")!.addEventListener("click", () => void startRecording());
  document.querySelector<HTMLButtonElement>("#retry-processing")!.addEventListener("click", () => {
    if (pendingAudio) void processAudioBlob(pendingAudio).catch((error) => { setPhase("error"); status("Could not retry processing", error instanceof Error ? error.message : "Try again."); setRetryVisible(true); });
  });
  bindSettings();
}

function renderMain(): void {
  phase = "ready";
  level = settings.level;
  root.innerHTML = mainScreen();
  selectMode();
  bindMainEvents();
  status("Ready", "Tap the mic and speak naturally.");
}

function bindPhoneEvents(): void {
  const input = document.querySelector<HTMLTextAreaElement>("#phone-input-text")!;
  document.querySelectorAll<HTMLButtonElement>("[data-level]").forEach((button) => button.addEventListener("click", async () => {
    level = Number(button.dataset.level) as ProcessingLevel;
    settings = await saveSettings({ level });
    selectMode();
  }));
  document.querySelector<HTMLButtonElement>("#optimize")!.addEventListener("click", async () => {
    rawTranscript = input.value.trim();
    if (!rawTranscript) { status("Add some words first", "Tap your keyboard microphone to dictate."); input.focus(); return; }
    setPhase("refining");
    setMicEnabled(false);
    status("Refining…", "Sending only your text to Gemini.");
    try {
      const refined = await refiner.refine(rawTranscript, level);
      setPhase("result");
      showResult(refined);
      status("Your prompt is ready", "Review it, then copy it into ChatGPT.");
    } catch (error) {
      setPhase("error");
      showResult(rawTranscript);
      status(error instanceof RefinerError ? "Refinement unavailable" : "Could not refine this text", "Your original dictated text is still available.");
      console.error("[Prompt Pilot Mobile] phone refinement failed", error);
    } finally { setMicEnabled(true); }
  });
  document.querySelector<HTMLButtonElement>("#copy")!.addEventListener("click", async () => { const output = resultArea(); const copied = await copyText(output.value, output); status(copied ? "✓ Copied" : "Select and copy manually", copied ? "Switch to ChatGPT and paste your prompt." : "Your prompt remains visible."); });
  document.querySelector<HTMLButtonElement>("#use-raw")!.addEventListener("click", () => { if (rawTranscript) { resultArea().value = rawTranscript; status("Using raw text", "You can edit it or copy it now."); } });
  document.querySelector<HTMLButtonElement>("#new-prompt")!.addEventListener("click", () => { input.value = ""; hideResult(); setPhase("ready"); status("Ready", "Dictate or type a request."); input.focus(); });
  bindSettings();
}

function renderPhone(): void {
  phase = "ready";
  level = settings.level;
  root.innerHTML = phoneScreen();
  selectMode();
  bindPhoneEvents();
  status("Ready", "Dictate or type a request, then optimize it.");
}

function renderApp(): void { if (capabilities.deviceClass === "phone") renderPhone(); else renderMain(); }

async function initialize(): Promise<void> {
  registerServiceWorker();
  capabilities = detectDeviceCapabilities();
  try {
    settings = await loadSettings();
    if (settings.geminiApiKey) renderApp(); else renderSetup();
  } catch (error) {
    console.error("[Prompt Pilot Mobile] settings unavailable", error);
    root.innerHTML = `<section class="setup-card"><h1>Prompt Pilot</h1><p>Browser storage is unavailable. Open this site outside Private Browsing and try again.</p></section>`;
  }
}

void initialize();
