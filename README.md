# Prompt Pilot

Prompt Pilot is split into two independent applications:

- `extension/` — the Manifest V3 Chrome extension for ChatGPT.com.
- `website/` — the mobile-friendly PWA and desktop fallback experience.

Build and test them independently:

```text
npm --prefix extension install
npm --prefix extension test
npm --prefix extension run build

npm --prefix website install
npm --prefix website test
npm --prefix website run build
```

The extension keeps local Whisper transcription on capable desktop browsers and integrates directly with the ChatGPT composer. The website uses native phone dictation on mobile and device-aware local/cloud transcription on desktop.
