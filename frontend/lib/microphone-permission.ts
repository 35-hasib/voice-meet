export type MicrophonePermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported";

/**
 * Whether the browser will let us start recording without asking.
 *
 * Only `"granted"` can be joined into automatically. Every other state has to go
 * through the lobby's Join button, because that click is the user gesture the
 * browser needs before it will show a permission prompt. Asking for the
 * microphone on page load instead would fail outright on Safari and, once a
 * prompt is dismissed, would never prompt again, so the attempt would fail on
 * every subsequent visit.
 *
 * `navigator.permissions` is not implemented everywhere; anything unknown
 * reports `"unsupported"`, which is treated as "not granted" and so falls back
 * to the button. That is the safe direction to fail in.
 */
export async function queryMicrophonePermission(): Promise<MicrophonePermissionState> {
  try {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.permissions?.query !== "function"
    ) {
      return "unsupported";
    }

    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });

    if (status.state === "granted") {
      return "granted";
    }

    if (status.state === "denied") {
      return "denied";
    }

    return "prompt";
  } catch {
    return "unsupported";
  }
}
