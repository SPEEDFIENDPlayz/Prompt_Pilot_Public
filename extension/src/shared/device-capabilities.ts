export type DeviceClass = "capable-desktop" | "constrained-desktop";
export type TranscriptionMode = "auto" | "local" | "cloud";

export interface DeviceCapabilities { deviceClass: DeviceClass; hasWebGPU: boolean; hardwareConcurrency: number; deviceMemory?: number }

export function detectDeviceCapabilities(): DeviceCapabilities {
  const hardwareConcurrency = navigator.hardwareConcurrency || 2;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const hasWebGPU = "gpu" in navigator;
  const memoryConstrained = typeof deviceMemory === "number" && deviceMemory < 4;
  return { deviceClass: hasWebGPU && hardwareConcurrency >= 6 && !memoryConstrained ? "capable-desktop" : "constrained-desktop", hasWebGPU, hardwareConcurrency, deviceMemory };
}

export function shouldUseCloud(mode: TranscriptionMode, deviceClass: DeviceClass): boolean { return mode === "cloud" || (mode === "auto" && deviceClass === "constrained-desktop"); }
