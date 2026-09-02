# Prompt Pilot Mobile

A standalone iPhone-focused PWA. The existing Chrome extension in the repository root is intentionally separate and unchanged.

## Local development

```powershell
cd web
npm install
npm run dev
```

Run `npm run test` and `npm run build` before deployment.

## Cloudflare Pages

Create a Git-integrated Pages project with:

- Root directory: `web`
- Build command: `npm run build`
- Build output directory: `dist`

HTTPS is required for microphone access and clipboard writes. Keep the deployment private while using a browser-stored personal Gemini key.

## Required real-iPhone validation

Open the HTTPS deployment in Safari, then test it again after **Share → Add to Home Screen**:

1. Save a Gemini key and grant microphone permission after tapping the mic.
2. Record 30-, 60-, and 90-second technical prompts in both Safari and standalone mode.
3. Measure cold model load, warm transcription, and Gemini refinement time.
4. Confirm WebGPU where available and the WASM fallback where it is not.
5. Copy a multiline result and paste it into the ChatGPT iOS app.
6. Exercise denied mic permission, no speech, offline/refinement failure, light/dark mode, rotation, and background/relaunch behavior.

Audio remains local in the default path. The model is downloaded from Hugging Face on first use; only the resulting text transcript is sent to Gemini.
