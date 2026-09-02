export function registerServiceWorker(): void {
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Service worker registration failed", error)));
  }
}
