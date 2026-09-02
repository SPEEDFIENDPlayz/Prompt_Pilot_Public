import "./styles.css";
import { blobTo16kMono } from "./audio/audio-processing";
import { MobileRecorder } from "./audio/recorder";
import { DEFAULT_LEVEL } from "./core/config";
import { RefinerError } from "./core/errors";
import { GeminiRefiner } from "./core/gemini-refiner";
import type { AppPhase, ProcessingLevel, Timings } from "./core/types";
import { registerServiceWorker } from "./pwa/register-service-worker";
import { loadSettings, saveSettings, type Settings } from "./storage/settings-store";
import { transcribe, warmTranscriber } from "./transcription/transcriber";
import { copyText } from "./ui/clipboard";
import { mainScreen, setupScreen } from "./ui/screens";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Prompt Pilot could not start.");
const root = app;

let settings: Settings;
let phase: AppPhase = "setup";
let level: ProcessingLevel = DEFAULT_LEVEL;
let rawTranscript = "";
let recorder: MobileRecorder | undefined;
let timer: number | undefined;
let recordStartedAt = 0;
const timings: Timings = {};

const refiner = new GeminiRefiner(async () => settings?.geminiApiKey);

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
    renderMain();
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
function setMicEnabled(enabled: boolean): void { document.querySelector<HTMLButtonElement>("#mic")!.disabled = !enabled; }
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
  hideResult();
  setPhase("recording");
  setMicEnabled(false);
  status("Starting microphone…", "Allow microphone access when Safari asks.");
  try {
    recorder = new MobileRecorder();
    await recorder.start();
    recordStartedAt = Date.now();
    status("Recording 0:00", "Tap again when you are done.");
    timer = window.setInterval(() => status(`Recording ${elapsed(Math.floor((Date.now() - recordStartedAt) / 1000))}`, "Tap again when you are done."), 250);
    // Warm the model while the user speaks. The active transcription request
    // joins the same worker load if the user stops before it is ready.
    warmTranscriber();
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
    setPhase("transcribing");
    status("Transcribing…", "Loading the local speech model if needed.");
    const pcm = await blobTo16kMono(blob);
    const transcribedAt = now();
    rawTranscript = await transcribe(pcm, (event) => {
      const percent = typeof event.progress === "number" ? ` ${Math.round(event.progress)}%` : "";
      status(`Transcribing${percent}…`, event.detail ? `Loading ${event.detail}` : "Working locally on your phone.");
    });
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
  } catch (error) {
    setPhase("error");
    const message = error instanceof Error ? error.message : "Prompt Pilot could not finish this recording.";
    if (rawTranscript) {
      showResult(rawTranscript);
      status(error instanceof RefinerError ? "Refinement unavailable" : "Transcription issue", "Your raw transcript is ready to copy or edit.");
    } else {
      hideResult();
      status(message === "No speech detected." ? message : "Could not transcribe recording.", message === "No speech detected." ? "Try recording again and speak a little longer." : message);
    }
    console.error("[Prompt Pilot Mobile] operation failed", error);
  } finally { setMicEnabled(true); }
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
  const dialog = document.querySelector<HTMLDialogElement>("#settings-dialog")!;
  document.querySelector<HTMLButtonElement>("#settings")!.addEventListener("click", () => { document.querySelector<HTMLInputElement>("#settings-key")!.value = ""; dialog.showModal(); });
  document.querySelector<HTMLButtonElement>("#save-settings")!.addEventListener("click", async () => {
    const key = document.querySelector<HTMLInputElement>("#settings-key")!.value.trim();
    if (key) settings = await saveSettings({ geminiApiKey: key });
    dialog.close();
  });
  document.querySelector<HTMLButtonElement>("#remove-key")!.addEventListener("click", async () => { settings = await saveSettings({ geminiApiKey: undefined, introSeen: false }); dialog.close(); renderSetup(); });
}

function renderMain(): void {
  phase = "ready";
  level = settings.level;
  root.innerHTML = mainScreen();
  selectMode();
  bindMainEvents();
  status("Ready", "Tap the mic and speak naturally.");
}

async function initialize(): Promise<void> {
  registerServiceWorker();
  try {
    settings = await loadSettings();
    if (settings.geminiApiKey) renderMain(); else renderSetup();
  } catch (error) {
    console.error("[Prompt Pilot Mobile] settings unavailable", error);
    root.innerHTML = `<section class="setup-card"><h1>Prompt Pilot</h1><p>Browser storage is unavailable. Open this site outside Private Browsing and try again.</p></section>`;
  }
}

void initialize();
