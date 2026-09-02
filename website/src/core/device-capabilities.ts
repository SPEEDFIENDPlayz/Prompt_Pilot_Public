import type { DeviceClass, TranscriptionMode } from "./types";

export interface DeviceCapabilities {
  deviceClass: DeviceClass;
  hasWebGPU: boolean;
  hardwareConcurrency: number;
  deviceMemory?: number;
}

export interface DeviceSignals {
  isPhone: boolean;
  hasWebGPU: boolean;
  hardwareConcurrency: number;
  deviceMemory?: number;
}

export function classifyDeviceClass(signals: DeviceSignals): DeviceClass {
  if (signals.isPhone) return "phone";
  const memoryConstrained = typeof signals.deviceMemory === "number" && signals.deviceMemory < 4;
  return signals.hasWebGPU && signals.hardwareConcurrency >= 6 && !memoryConstrained ? "capable-desktop" : "constrained-desktop";
}

function isPhone(): boolean {
  const ua = navigator.userAgent || "";
  const mobileSignal = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const coarsePointer = matchMedia?.("(pointer: coarse)").matches ?? false;
  return mobileSignal && (coarsePointer || Math.min(innerWidth, innerHeight) <= 900);
}

export function detectDeviceCapabilities(): DeviceCapabilities {
  const hardwareConcurrency = navigator.hardwareConcurrency || 2;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const hasWebGPU = "gpu" in navigator;
  const deviceClass = classifyDeviceClass({ isPhone: isPhone(), hasWebGPU, hardwareConcurrency, deviceMemory });
  return { deviceClass, hasWebGPU, hardwareConcurrency, deviceMemory };
}

export function shouldUseCloud(mode: TranscriptionMode, deviceClass: DeviceClass): boolean {
  if (mode === "cloud") return true;
  if (mode === "local") return false;
  return deviceClass === "constrained-desktop";
}
