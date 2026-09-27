import { describe, expect, it } from "vitest";

import {
  CONNECTION_NOTICE_MESSAGE,
  isFailedConnection,
  isRecoveredConnection,
  shouldRetireConnectionNotice,
} from "@/lib/connection-notice";
import type { RtcConnectionState } from "@/types/rtc";

describe("isFailedConnection", () => {
  it("treats only failed as unable to carry audio", () => {
    expect(isFailedConnection("failed")).toBe(true);

    for (const state of [
      "new",
      "connecting",
      "connected",
      "disconnected",
      "closed",
    ] satisfies RtcConnectionState[]) {
      expect(isFailedConnection(state)).toBe(false);
    }
  });
});

describe("isRecoveredConnection", () => {
  it("treats connected and completed as recovered", () => {
    expect(isRecoveredConnection("connected")).toBe(true);
    expect(isRecoveredConnection("completed")).toBe(true);
  });

  it("does not treat in-progress or dead states as recovered", () => {
    for (const state of [
      "new",
      "connecting",
      "disconnected",
      "failed",
      "closed",
    ] satisfies RtcConnectionState[]) {
      expect(isRecoveredConnection(state)).toBe(false);
    }
  });
});

describe("shouldRetireConnectionNotice", () => {
  it("retires the notice once the peer is connected again", () => {
    expect(
      shouldRetireConnectionNotice(CONNECTION_NOTICE_MESSAGE, ["connected"]),
    ).toBe(true);
  });

  it("keeps the notice while the peer is still failed", () => {
    expect(shouldRetireConnectionNotice(CONNECTION_NOTICE_MESSAGE, ["failed"])).toBe(
      false,
    );
  });

  it("keeps the notice while another participant is still unreachable", () => {
    expect(
      shouldRetireConnectionNotice(CONNECTION_NOTICE_MESSAGE, [
        "connected",
        "failed",
      ]),
    ).toBe(false);
  });

  it("retires the notice when the failing participant leaves", () => {
    expect(shouldRetireConnectionNotice(CONNECTION_NOTICE_MESSAGE, [])).toBe(
      true,
    );
  });

  it("never swallows an unrelated error", () => {
    for (const error of [
      null,
      "Enter a display name to join this meeting.",
      "Your microphone stream is no longer available. Leave the meeting and rejoin to reconnect your audio.",
      "The connection was interrupted. Reconnecting…",
    ]) {
      expect(shouldRetireConnectionNotice(error, ["connected"])).toBe(false);
    }
  });
});
