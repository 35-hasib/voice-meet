import { afterEach, describe, expect, it } from "vitest";
import { queryMicrophonePermission } from "@/lib/microphone-permission";

interface FakePermissionStatus {
  state: string;
}

function installNavigator(permissions: unknown): void {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: { permissions },
  });
}

function uninstallNavigator(): void {
  Reflect.deleteProperty(globalThis, "navigator");
}

afterEach(() => {
  uninstallNavigator();
});

describe("queryMicrophonePermission", () => {
  it("reports granted when the microphone is already allowed", async () => {
    installNavigator({
      query: async () => ({ state: "granted" }) satisfies FakePermissionStatus,
    });

    expect(await queryMicrophonePermission()).toBe("granted");
  });

  it("reports prompt when the user has not been asked yet", async () => {
    installNavigator({ query: async () => ({ state: "prompt" }) });

    expect(await queryMicrophonePermission()).toBe("prompt");
  });

  it("reports denied when the microphone is blocked", async () => {
    installNavigator({ query: async () => ({ state: "denied" }) });

    expect(await queryMicrophonePermission()).toBe("denied");
  });

  it("reports unsupported when the browser has no permissions API", async () => {
    installNavigator(undefined);

    expect(await queryMicrophonePermission()).toBe("unsupported");
  });

  it("reports unsupported when the browser rejects the query", async () => {
    installNavigator({
      query: async () => {
        throw new TypeError("microphone is not a supported permission name");
      },
    });

    // Safari can throw rather than answer, and that must not be mistaken for
    // permission: it has to fall back to the Join button.
    expect(await queryMicrophonePermission()).toBe("unsupported");
  });

  it("reports unsupported when there is no navigator at all", async () => {
    uninstallNavigator();

    expect(await queryMicrophonePermission()).toBe("unsupported");
  });
});
