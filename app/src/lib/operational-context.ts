import { useSyncExternalStore } from "react";

export type OperationalContext = {
  projectId: number | null;
  parcelId: number | null;
};

const PROJECT_KEY = "foggara.activeProject";
const PARCEL_KEY = "foggara.activeParcel";
const EVENT_NAME = "foggara:operational-context";

function readId(key: string): number | null {
  if (typeof window === "undefined") return null;
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

let current: OperationalContext = {
  projectId: readId(PROJECT_KEY),
  parcelId: readId(PARCEL_KEY),
};

function readFromStorage(): OperationalContext {
  return {
    projectId: readId(PROJECT_KEY),
    parcelId: readId(PARCEL_KEY),
  };
}

function same(a: OperationalContext, b: OperationalContext) {
  return a.projectId === b.projectId && a.parcelId === b.parcelId;
}

function syncFromStorage() {
  const next = readFromStorage();
  if (!same(next, current)) current = next;
}

function emit() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT_NAME));
  }
}

export function getOperationalContext() {
  syncFromStorage();
  return current;
}

export function setActiveProjectId(projectId: number | null) {
  if (typeof window === "undefined") return;
  if (projectId) window.localStorage.setItem(PROJECT_KEY, String(projectId));
  else window.localStorage.removeItem(PROJECT_KEY);
  window.localStorage.removeItem(PARCEL_KEY);
  current = { projectId, parcelId: null };
  emit();
}

export function setActiveParcelId(parcelId: number | null) {
  if (typeof window === "undefined") return;
  if (parcelId) window.localStorage.setItem(PARCEL_KEY, String(parcelId));
  else window.localStorage.removeItem(PARCEL_KEY);
  current = { ...current, parcelId };
  emit();
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onContext = () => {
    syncFromStorage();
    callback();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === PROJECT_KEY || event.key === PARCEL_KEY) onContext();
  };
  window.addEventListener(EVENT_NAME, onContext);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, onContext);
    window.removeEventListener("storage", onStorage);
  };
}

export function useOperationalContext() {
  return useSyncExternalStore(
    subscribe,
    getOperationalContext,
    () => ({ projectId: null, parcelId: null }),
  );
}
