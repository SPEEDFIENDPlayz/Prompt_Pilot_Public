import "./options.css";

const keyInput = document.querySelector<HTMLInputElement>("#api-key")!;
const keyStatus = document.querySelector<HTMLElement>("#key-status")!;
const micStatus = document.querySelector<HTMLElement>("#mic-status")!;
const shortcut = document.querySelector<HTMLElement>("#shortcut")!;
const transcriptionMode = document.querySelector<HTMLSelectElement>("#transcription-mode")!;
const transcriptionStatus = document.querySelector<HTMLElement>("#transcription-status")!;

async function refresh(): Promise<void> {
  const value = await chrome.storage.local.get("geminiApiKey");
  keyStatus.textContent = typeof value.geminiApiKey === "string" && value.geminiApiKey ? "A key is saved locally." : "No key configured.";
  const commands = await chrome.commands.getAll();
  shortcut.textContent = commands.find((command) => command.name === "toggle-recording")?.shortcut || "Not assigned";
  const mode = await chrome.storage.local.get("transcriptionMode");
  transcriptionMode.value = mode.transcriptionMode === "local" || mode.transcriptionMode === "cloud" ? mode.transcriptionMode : "auto";
  transcriptionStatus.textContent = transcriptionMode.value === "cloud" ? "Audio will be sent to Gemini Transcribe." : transcriptionMode.value === "local" ? "Audio stays on this computer." : "Prompt Pilot chooses local or cloud based on device capability.";
}

document.querySelector<HTMLButtonElement>("#save-key")!.addEventListener("click", async () => {
  const key = keyInput.value.trim();
  if (!key) { keyStatus.textContent = "Enter a key first."; return; }
  await chrome.storage.local.set({ geminiApiKey: key });
  keyInput.value = "";
  keyStatus.textContent = "Saved locally.";
});

transcriptionMode.addEventListener("change", async () => {
  const mode = transcriptionMode.value === "local" || transcriptionMode.value === "cloud" ? transcriptionMode.value : "auto";
  await chrome.storage.local.set({ transcriptionMode: mode });
  transcriptionStatus.textContent = mode === "cloud" ? "Audio will be sent to Gemini Transcribe." : mode === "local" ? "Audio stays on this computer." : "Prompt Pilot chooses local or cloud based on device capability.";
});

document.querySelector<HTMLButtonElement>("#remove-key")!.addEventListener("click", async () => {
  await chrome.storage.local.remove("geminiApiKey");
  keyInput.value = "";
  keyStatus.textContent = "Key removed.";
});

document.querySelector<HTMLButtonElement>("#enable-mic")!.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    micStatus.textContent = "Microphone enabled. You can record from ChatGPT now.";
  } catch {
    micStatus.textContent = "Microphone access was denied. Allow it in Chrome site settings and try again.";
  }
});

document.querySelector<HTMLButtonElement>("#change-shortcut")!.addEventListener("click", () => {
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

void refresh();
