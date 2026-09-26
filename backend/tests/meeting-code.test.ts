import { describe, expect, it } from "vitest";
import { isMeetingCode } from "../src/validation/meeting-code.js";
import { generateMeetingCode } from "../src/services/meeting-code.js";

describe("meeting codes", () => {
  it("generates 12-character base64url codes", () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const meetingCode = generateMeetingCode();
      expect(meetingCode).toHaveLength(12);
      expect(isMeetingCode(meetingCode)).toBe(true);
    }
  });

  it("rejects malformed codes", () => {
    expect(isMeetingCode("too-short")).toBe(false);
    expect(isMeetingCode("AAAAAAAAAAAAA")).toBe(false);
    expect(isMeetingCode("AAAAAAAA/AAA")).toBe(false);
  });
});
