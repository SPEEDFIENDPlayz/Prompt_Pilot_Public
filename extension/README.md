# Prompt Pilot

Prompt Pilot is a personal Manifest V3 Chrome extension for turning messy voice notes into prompts for ChatGPT.

## Local development

```text
npm install
npm test
npm run build
```

Load the `dist` folder from `chrome://extensions` with Developer mode enabled. Open Prompt Pilot’s toolbar action once to configure a Gemini API key and grant microphone access. A Groq key is optional and is used only when you explicitly enable **Chat context** on a capable local desktop.

The first recording downloads the local Whisper model and may take longer. Later recordings reuse the browser cache. Capable desktops can transcribe buffered audio chunks while recording. Constrained devices can use the configured cloud-transcription fallback. If local inference stalls, Auto mode falls back instead of waiting forever. Prompt Pilot never presses ChatGPT’s Send button.

The compact selector is labelled **Natural**, **Clean**, and **Pro**. After insertion, **Make clearer** runs an optional second Gemini pass and can only apply when the composer has not been edited. Chat context is exported in memory, condensed by Groq, and discarded after refinement; the full conversation is not sent to Gemini.

## Checks

The extension is intentionally scoped to `https://chatgpt.com/*` and does not save recordings, transcript history, or analytics.
