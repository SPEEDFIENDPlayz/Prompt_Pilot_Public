# Prompt Pilot

Prompt Pilot is a personal Manifest V3 Chrome extension for turning messy voice notes into prompts for ChatGPT.

## Local development

```text
npm install
npm run build
```

Load the `dist` folder from `chrome://extensions` with Developer mode enabled. Open Prompt Pilot’s toolbar action once to configure a Gemini API key and grant microphone access.

The first recording downloads the local Whisper model and may take longer. Later recordings reuse the browser cache. Audio is recorded and transcribed locally; only the resulting transcript text is sent to Gemini. Prompt Pilot never presses ChatGPT’s Send button.

## Checks

```text
npm test
npm run build
```

The extension is intentionally scoped to `https://chatgpt.com/*` and does not save recordings, transcript history, or analytics.
