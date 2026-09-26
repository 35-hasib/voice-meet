import { describe, expect, it } from "vitest";
import {
  buildMeetingLink,
  extractMeetingCode,
  getInitials,
  MAX_DISPLAY_NAME_CHARACTERS,
  normalizeDisplayName,
} from "@/lib/validation";

describe("extractMeetingCode", () => {
  it("accepts a base64url meeting code without changing case", () => {
    expect(extractMeetingCode("7kF9xP2mQa12")).toBe("7kF9xP2mQa12");
  });

  it("extracts the code from a full meeting URL", () => {
    expect(
      extractMeetingCode("https://audio-meet.vercel.app/meet/AbC92xKp-a_1"),
    ).toBe("AbC92xKp-a_1");
  });

  it("rejects sequential, short, and invalid codes", () => {
    expect(extractMeetingCode("1")).toBeNull();
    expect(extractMeetingCode("does-not-exist")).toBeNull();
    expect(extractMeetingCode("1234567890123")).toBeNull();
    expect(extractMeetingCode("has space!!")).toBeNull();
  });
});

describe("normalizeDisplayName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeDisplayName("  Hasib   Rahman  ")).toBe("Hasib Rahman");
  });

  it("removes control characters", () => {
    expect(normalizeDisplayName("Ha\u0000sib\u0007")).toBe("Ha sib");
  });

  it("limits the value to the supported character count", () => {
    const normalized = normalizeDisplayName("a".repeat(80));
    expect(normalized).toHaveLength(MAX_DISPLAY_NAME_CHARACTERS);
  });
});

describe("getInitials", () => {
  it("uses the first two characters for a single name", () => {
    expect(getInitials("Hasib")).toBe("HA");
  });

  it("uses the first character of the first two words", () => {
    expect(getInitials("Hasib Rahman")).toBe("HR");
  });

  it("keeps unicode initials intact", () => {
    expect(getInitials("আলি")).toBe("আলি");
  });
});

describe("buildMeetingLink", () => {
  it("builds a permanent link without a duplicated slash", () => {
    expect(buildMeetingLink("https://app.example.com/", "7kF9xP2mQa12")).toBe(
      "https://app.example.com/meet/7kF9xP2mQa12",
    );
  });
});
