import type { ManifestV3Export } from "@crxjs/vite-plugin";

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: "Prompt Pilot",
  description: "Local voice-to-prompt refinement for ChatGPT.",
  version: "0.1.0",
  minimum_chrome_version: "116",
  action: {
    default_title: "Prompt Pilot settings",
  },
  options_page: "src/options/options.html",
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://chatgpt.com/*"],
      js: ["src/content/content-script.ts"],
      run_at: "document_idle",
    },
  ],
  host_permissions: [
    "https://chatgpt.com/*",
    "https://generativelanguage.googleapis.com/*",
    "https://api.groq.com/*",
    "https://huggingface.co/*",
    "https://*.huggingface.co/*",
  ],
  permissions: ["storage", "tabs", "offscreen", "unlimitedStorage"],
  commands: {
    "toggle-recording": {
      suggested_key: { default: "Alt+Shift+V" },
      description: "Start or stop Prompt Pilot recording",
    },
  },
};

export default manifest;
