import { describe, expect, it } from "vitest";
import {
  iceCandidateSchema,
  MAX_ICE_CANDIDATE_BYTES,
  MAX_SDP_BYTES,
  meetingJoinSchema,
  offerSchema,
  participantStateSchema,
} from "../src/socket/schemas.js";

const PARTICIPANT_ID = "AAAAAAAAAAAAAAAAAAAAAA";
const MEETING_CODE = "AAAAAAAAAAAA";

describe("socket payload schemas", () => {
  it("trims a valid meeting join payload", () => {
    const parsed = meetingJoinSchema.safeParse({
      meetingCode: MEETING_CODE,
      displayName: "  Hasib  ",
    });

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.displayName).toBe("Hasib");
    }
  });

  it("rejects blank and overlong display names", () => {
    expect(
      meetingJoinSchema.safeParse({
        meetingCode: MEETING_CODE,
        displayName: "   ",
      }).success,
    ).toBe(false);
    expect(
      meetingJoinSchema.safeParse({
        meetingCode: MEETING_CODE,
        displayName: "x".repeat(41),
      }).success,
    ).toBe(false);
    expect(
      meetingJoinSchema.safeParse({
        meetingCode: MEETING_CODE,
        displayName: "क्ष".repeat(40),
      }).success,
    ).toBe(true);
    expect(
      meetingJoinSchema.safeParse({
        meetingCode: MEETING_CODE,
        displayName: "क्ष".repeat(41),
      }).success,
    ).toBe(false);
  });

  it("rejects malformed targets and oversized SDP", () => {
    expect(
      offerSchema.safeParse({
        targetParticipantId: "short",
        sdp: "offer",
      }).success,
    ).toBe(false);
    expect(
      offerSchema.safeParse({
        targetParticipantId: PARTICIPANT_ID,
        sdp: "x".repeat(MAX_SDP_BYTES + 1),
      }).success,
    ).toBe(false);
  });

  it("limits ICE candidate payload fields", () => {
    expect(
      iceCandidateSchema.safeParse({
        targetParticipantId: PARTICIPANT_ID,
        candidate: "candidate:example",
        sdpMid: "0",
        sdpMLineIndex: 0,
      }).success,
    ).toBe(true);
    expect(
      iceCandidateSchema.safeParse({
        targetParticipantId: PARTICIPANT_ID,
        candidate: "x".repeat(MAX_ICE_CANDIDATE_BYTES + 1),
      }).success,
    ).toBe(false);
  });

  it("requires a boolean participant state", () => {
    expect(participantStateSchema.safeParse({ muted: true }).success).toBe(
      true,
    );
    expect(participantStateSchema.safeParse({ muted: "true" }).success).toBe(
      false,
    );
  });
});
