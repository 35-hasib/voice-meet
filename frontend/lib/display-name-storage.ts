import { normalizeDisplayName } from "./validation";

export const DISPLAY_NAME_STORAGE_KEY = "voice-meet:display-name";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

/**
 * `localStorage` access throws rather than returning null when storage is
 * blocked, so even reaching for it is guarded. A missing store is not an error:
 * the name simply does not persist and the user types it every time.
 */
function getStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The stored name, normalized on read. A value can be stale or hand-edited, and
 * this is the only place the string turns back into something safe to send to
 * the server, so it goes through the same validation as typed input.
 */
export function readStoredDisplayName(): string {
  const storage = getStorage();

  if (storage === null) {
    return "";
  }

  try {
    return normalizeDisplayName(
      storage.getItem(DISPLAY_NAME_STORAGE_KEY) ?? "",
    );
  } catch {
    return "";
  }
}

/**
 * Stores the name the user actually joined with, already normalized, so a
 * stored value is always a name that the server accepted.
 */
export function storeDisplayName(name: string): void {
  const normalized = normalizeDisplayName(name);

  if (normalized.length === 0) {
    return;
  }

  const storage = getStorage();

  if (storage === null) {
    return;
  }

  try {
    storage.setItem(DISPLAY_NAME_STORAGE_KEY, normalized);
  } catch {
    // A full or blocked store must never fail a join that already succeeded.
  }
}

/**
 * Server rendering has no storage, so the first paint is always the empty name
 * and the real value arrives on the client's first render after hydration. That
 * is what keeps this from being a hydration mismatch.
 */
export function getStoredDisplayNameServerSnapshot(): string {
  return "";
}

/**
 * Syncs the name across tabs. The event only fires in *other* tabs, which is
 * exactly what is wanted: this tab already knows what it wrote.
 */
export function subscribeToStoredDisplayName(
  onStoreChange: () => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
  };
}
