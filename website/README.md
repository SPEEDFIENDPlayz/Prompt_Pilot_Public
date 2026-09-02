# Prompt Pilot Mobile

A standalone iPhone-focused PWA. The existing Chrome extension in the repository root is intentionally separate and unchanged.

## Local development

```powershell
cd website
npm install
npm run dev
```

Run `npm run test` and `npm run build` before deployment.

## Cloudflare Pages

The gpt-sites deployment is configured for this `website` folder with:

- Root directory: `website`
- Build command: `npm run build`
- Build output directory: `dist`

HTTPS is required for clipboard writes and any desktop recording path. Phone mode uses the phone keyboard’s native dictation and does not request microphone access from the website.

## Required real-iPhone validation

Open the HTTPS deployment in Safari, then test it again after **Share → Add to Home Screen**:

1. Save a Gemini key.
2. On iPhone/Android, use the keyboard dictation microphone in the text area.
3. On capable desktop Chrome, record 30-, 60-, and 90-second technical prompts.
4. On a constrained desktop, verify automatic cloud transcription.
5. Copy a multiline result and paste it into the ChatGPT iOS app.
6. Exercise offline/refinement failure, light/dark mode, rotation, and background/relaunch behavior.

Local desktop mode keeps audio on the device. Automatic cloud mode sends the temporary recording to Gemini Transcribe, then sends only the resulting text to Gemini Flash-Lite. Phone mode captures no Prompt Pilot audio; it uses native keyboard dictation.
