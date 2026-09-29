import { afterEach, describe, expect, it } from "vitest";
import {
  DISPLAY_NAME_STORAGE_KEY,
  readStoredDisplayName,
  storeDisplayName,
  getStoredDisplayNameServerSnapshot,
  subscribeToStoredDisplayName,
} from "@/lib/display-name-storage";

interface FakeStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  readonly data: Map<string, string>;
}

function createFakeStorage(seed: Record<string, string> = {}): FakeStorage {
  const data = new Map(Object.entries(seed));

  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

/**
 * The real `window` global is read-only and absent under the node test
 * environment, so it is installed as a plain property and torn down after each
 * test to keep the cases independent.
 */
function installWindow(storage: unknown, eventTarget = new EventTarget()): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      localStorage: storage,
      addEventListener: eventTarget.addEventListener.bind(eventTarget),
      removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    },
  });
}

function uninstallWindow(): void {
  Reflect.deleteProperty(globalThis, "window");
}

afterEach(() => {
  uninstallWindow();
});

describe("readStoredDisplayName", () => {
  it("returns an empty name when nothing is stored", () => {
    installWindow(createFakeStorage());

    expect(readStoredDisplayName()).toBe("");
  });

  it("returns the stored name", () => {
    installWindow(
      createFakeStorage({ [DISPLAY_NAME_STORAGE_KEY]: "Hasib Rahman" }),
    );

    expect(readStoredDisplayName()).toBe("Hasib Rahman");
  });

  it("normalizes a stored value that was edited or stored stale", () => {
    installWindow(
      createFakeStorage({ [DISPLAY_NAME_STORAGE_KEY]: "  Hasib\u0007  Rahman  " }),
    );

    expect(readStoredDisplayName()).toBe("Hasib Rahman");
  });

  it("truncates an overlong stored value to what the server would accept", () => {
    installWindow(
      createFakeStorage({ [DISPLAY_NAME_STORAGE_KEY]: "a".repeat(200) }),
    );

    expect(readStoredDisplayName()).toHaveLength(40);
  });

  it("returns an empty name when there is no storage at all", () => {
    uninstallWindow();

    expect(readStoredDisplayName()).toBe("");
  });

  it("returns an empty name when reading storage throws", () => {
    const hostile = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    installWindow(hostile);

    expect(readStoredDisplayName()).toBe("");
  });
});

describe("storeDisplayName", () => {
  it("stores the normalized name", () => {
    const storage = createFakeStorage();
    installWindow(storage);

    storeDisplayName("  Hasib   Rahman  ");

    expect(storage.data.get(DISPLAY_NAME_STORAGE_KEY)).toBe("Hasib Rahman");
  });

  it("does not store a name that is empty once normalized", () => {
    const storage = createFakeStorage();
    installWindow(storage);

    storeDisplayName("   ");

    expect(storage.data.has(DISPLAY_NAME_STORAGE_KEY)).toBe(false);
  });

  it("round-trips through the reader", () => {
    const storage = createFakeStorage();
    installWindow(storage);

    storeDisplayName("আলি");

    expect(readStoredDisplayName()).toBe("আলি");
  });

  it("does not throw when the store is full or blocked", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    installWindow(storage);

    expect(() => {
      storeDisplayName("Hasib");
    }).not.toThrow();
  });

  it("does not throw when there is no storage", () => {
    uninstallWindow();

    expect(() => {
      storeDisplayName("Hasib");
    }).not.toThrow();
  });
});

describe("stored name server snapshot", () => {
  it("is empty so the server-rendered input matches hydration", () => {
    installWindow(
      createFakeStorage({ [DISPLAY_NAME_STORAGE_KEY]: "Hasib" }),
    );

    expect(getStoredDisplayNameServerSnapshot()).toBe("");
  });
});

describe("subscribeToStoredDisplayName", () => {
  it("reacts to a storage change from another tab", () => {
    const eventTarget = new EventTarget();
    installWindow(createFakeStorage(), eventTarget);
    let calls = 0;

    const unsubscribe = subscribeToStoredDisplayName(() => {
      calls += 1;
    });

    eventTarget.dispatchEvent(new Event("storage"));
    expect(calls).toBe(1);

    unsubscribe();
    eventTarget.dispatchEvent(new Event("storage"));
    expect(calls).toBe(1);
  });

  it("returns a no-op unsubscribe when there is no window", () => {
    uninstallWindow();

    expect(() => subscribeToStoredDisplayName(() => undefined)()).not.toThrow();
  });
});
