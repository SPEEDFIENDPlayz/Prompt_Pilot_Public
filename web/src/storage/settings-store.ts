import { DEFAULT_LEVEL } from "../core/config";
import type { ProcessingLevel } from "../core/types";

const DATABASE = "prompt-pilot-mobile";
const STORE = "settings";
const KEY = "current";

export interface Settings { geminiApiKey?: string; level: ProcessingLevel; introSeen: boolean }
const defaults = (): Settings => ({ level: DEFAULT_LEVEL, introSeen: false });

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadSettings(): Promise<Settings> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    request.onsuccess = () => { db.close(); resolve({ ...defaults(), ...(request.result as Partial<Settings> | undefined) }); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function saveSettings(update: Partial<Settings>): Promise<Settings> {
  const next = { ...await loadSettings(), ...update };
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(next, KEY);
    request.onsuccess = () => { db.close(); resolve(next); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
