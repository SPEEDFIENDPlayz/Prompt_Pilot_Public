export const micIcon = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-3.07A7 7 0 0 1 5 11a1 1 0 1 1 2 0 5 5 0 0 0 10 0Z"/></svg>`;

export function setupScreen(): string {
  return `<section class="setup-card"><div class="brand-mark">✦</div><h1>Prompt Pilot</h1><p>Talk naturally. Prompt Pilot cleans up your words so you can copy a clear prompt into ChatGPT.</p><label for="api-key">Gemini API key</label><input id="api-key" type="password" autocomplete="off" placeholder="Paste your personal key" /><p class="privacy">Your recording stays on this device. Only its text transcript is sent to Gemini for refinement.</p><button id="save-setup" class="primary" type="button">Save and continue</button></section>`;
}

export function mainScreen(): string {
  return `<header><div><p class="eyebrow">Prompt Pilot</p><h1>Talk. Refine. Copy.</h1></div><button id="settings" class="icon-button" aria-label="Settings">⚙</button></header>
  <section class="mode-control" aria-label="Processing mode"><button data-level="1">Natural</button><button data-level="2">Clear</button><button data-level="3">Pro</button></section>
  <section class="record-section"><button id="mic" class="mic" type="button" aria-label="Start recording">${micIcon}</button><p id="status" role="status">Ready</p><p id="detail" class="detail">Tap the mic and speak naturally.</p></section>
  <section id="result" class="result" hidden><label for="prompt-output">Your prompt</label><textarea id="prompt-output" rows="9" spellcheck="true"></textarea><button id="copy" class="primary" type="button">Copy prompt</button><div class="secondary-actions"><button id="use-raw" type="button">Use raw</button><button id="record-again" type="button">Record again</button></div></section>
  <dialog id="settings-dialog"><form method="dialog"><div class="dialog-heading"><h2>Settings</h2><button value="cancel" class="icon-button" aria-label="Close settings">×</button></div><label for="settings-key">Gemini API key</label><input id="settings-key" type="password" autocomplete="off" placeholder="Replace your key" /><p class="privacy">This key stays in browser storage on this device. Do not use a shared key on a public website.</p><button id="save-settings" class="primary" type="button">Save key</button><button id="remove-key" class="text-button" type="button">Remove key</button></form></dialog>`;
}
