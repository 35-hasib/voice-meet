import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  IceCredentialsService,
  TURN_CREDENTIAL_TTL_SECONDS,
} from "../src/services/ice-credentials.service.js";
import { MeetingService } from "../src/services/meeting.service.js";
import { FakeMeetingRepository } from "./support/fake-meeting.repository.js";

const MEETING_CODE = "AAAAAAAAAAAA";

describe("IceCredentialsService", () => {
  it("returns STUN only when TURN is not configured", async () => {
    const repository = new FakeMeetingRepository();
    repository.seed(MEETING_CODE, "ACTIVE");
    const service = new IceCredentialsService(
      new MeetingService(repository),
      null,
      ["stun:stun.example.com:3478"],
    );

    await expect(service.getIceServers(MEETING_CODE)).resolves.toEqual([
      { urls: "stun:stun.example.com:3478" },
    ]);
  });

  it("issues bounded HMAC-SHA1 credentials without exposing the secret", async () => {
    const repository = new FakeMeetingRepository();
    repository.seed(MEETING_CODE, "ACTIVE");
    const sharedSecret = "test-shared-secret-that-must-never-be-returned";
    const now = 1_700_000_000_123;
    const service = new IceCredentialsService(
      new MeetingService(repository),
      {
        urls: ["turn:turn.example.com:3478?transport=udp"],
        usernamePrefix: "voice-meet",
        sharedSecret,
      },
      ["stun:stun.example.com:3478"],
      () => now,
    );

    const iceServers = await service.getIceServers(MEETING_CODE);
    const expectedExpiration =
      Math.floor(now / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
    const expectedUsername = `voice-meet:${expectedExpiration.toString()}`;
    const expectedCredential = createHmac("sha1", sharedSecret)
      .update(expectedUsername)
      .digest("base64");

    expect(iceServers).toEqual([
      { urls: "stun:stun.example.com:3478" },
      {
        urls: "turn:turn.example.com:3478?transport=udp",
        username: expectedUsername,
        credential: expectedCredential,
      },
    ]);
    expect(expectedExpiration - Math.floor(now / 1000)).toBe(300);
    expect(JSON.stringify(iceServers)).not.toContain(sharedSecret);
  });
});
