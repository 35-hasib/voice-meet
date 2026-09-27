import type { RtcConnectionState } from "@/types/rtc";

/**
 * Shown when a peer connection cannot carry audio.
 *
 * Owned here rather than inline in the hook so the notice and the rule for
 * retiring it cannot drift apart.
 */
export const CONNECTION_NOTICE_MESSAGE =
  "Unable to establish an audio connection. Please check your network and try again.";

/** This peer can no longer carry audio. */
export function isFailedConnection(state: RtcConnectionState): boolean {
  return state === "failed";
}

/**
 * This peer is carrying audio again.
 *
 * A failed ICE transport is frequently recoverable: the agent gathers a new
 * candidate pair and the connection returns to `connected` on its own, without
 * anybody rejoining.
 */
export function isRecoveredConnection(state: RtcConnectionState): boolean {
  return state === "connected" || state === "completed";
}

/**
 * Whether the connection notice should be taken down now.
 *
 * Retiring it needs two conditions, and both matter:
 *
 * - The visible error must be the connection notice. Join, microphone, and
 *   socket failures are unrelated and must never be silently swallowed.
 * - No peer may still be failed. With several participants, one recovering
 *   connection must not hide a second participant who is still unreachable.
 */
export function shouldRetireConnectionNotice(
  error: string | null,
  peerStates: readonly RtcConnectionState[],
): boolean {
  if (error !== CONNECTION_NOTICE_MESSAGE) {
    return false;
  }

  return !peerStates.some(isFailedConnection);
}
