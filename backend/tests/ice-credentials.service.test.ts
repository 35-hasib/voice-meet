import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  CloudflareTurnCredentialProvider,
  IceCredentialsService,
  normalizeCloudflareTtlSeconds,
  StaticTurnCredentialProvider,
  TURN_CREDENTIAL_TTL_SECONDS,
  type TurnCredentialProvider,
} from "../src/services/ice-credentials.service.js";
import { MeetingService } from "../src/services/meeting.service.js";
import { FakeMeetingRepository } from "./support/fake-meeting.repository.js";

const MEETING_CODE = "AAAAAAAAAAAA";

function readUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}

function activeService(): {
  service: IceCredentialsService;
  logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
} {
  const repository = new FakeMeetingRepository();
  repository.seed(MEETING_CODE, "ACTIVE");
  const logger = { info: vi.fn(), error: vi.fn() };
  const service = new IceCredentialsService(
    new MeetingService(repository),
    null,
    ["stun:stun.example.com:3478"],
    logger,
  );

  return { service, logger };
}

describe("IceCredentialsService", () => {
  it("returns STUN only when TURN is not configured", async () => {
    const { service } = activeService();

    await expect(service.getIceServers(MEETING_CODE)).resolves.toEqual([
      { urls: "stun:stun.example.com:3478" },
    ]);
  });

  it("issues bounded HMAC-SHA1 credentials without exposing the secret", async () => {
    const repository = new FakeMeetingRepository();
    repository.seed(MEETING_CODE, "ACTIVE");
    const sharedSecret = "test-shared-secret-that-must-never-be-returned";
    const now = 1_700_000_000_123;
    const provider = new StaticTurnCredentialProvider(
      {
        urls: ["turn:turn.example.com:3478?transport=udp"],
        usernamePrefix: "voice-meet",
        sharedSecret,
      },
      () => now,
    );
    const service = new IceCredentialsService(
      new MeetingService(repository),
      provider,
      ["stun:stun.example.com:3478"],
    );

    const iceServers = await service.getIceServers(MEETING_CODE);
    const expectedExpiration =
      Math.floor(now / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
    // coturn reads the text before the separator as the expiry timestamp, so the
    // timestamp must come first or every allocation is refused as expired.
    const expectedUsername = `${expectedExpiration.toString()}:voice-meet`;
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
    expect(expectedUsername.split(":")[0]).toMatch(/^\d+$/);
    expect(JSON.stringify(iceServers)).not.toContain(sharedSecret);
  });

  it("falls back to STUN only when the TURN provider fails", async () => {
    const repository = new FakeMeetingRepository();
    repository.seed(MEETING_CODE, "ACTIVE");
    const logger = { info: vi.fn(), error: vi.fn() };
    const failing: TurnCredentialProvider = {
      getServers: () => Promise.reject(new Error("provider unreachable")),
    };
    const service = new IceCredentialsService(
      new MeetingService(repository),
      failing,
      ["stun:stun.example.com:3478"],
      logger,
    );

    await expect(service.getIceServers(MEETING_CODE)).resolves.toEqual([
      { urls: "stun:stun.example.com:3478" },
    ]);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe("CloudflareTurnCredentialProvider", () => {
  const CLOUDFLARE_RESPONSE = {
    iceServers: [
      { urls: ["stun:stun.cloudflare.com:3478"] },
      {
        urls: [
          "turn:turn.cloudflare.com:3478?transport=udp",
          "turns:turn.cloudflare.com:5349?transport=tcp",
        ],
        username: "a".repeat(128),
        credential: "b".repeat(64),
      },
    ],
  };

  it("mints credentials through the Cloudflare API and caches them", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fakeFetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: readUrl(input), init });
      return Promise.resolve(
        new Response(JSON.stringify(CLOUDFLARE_RESPONSE), { status: 201 }),
      );
    });
    const provider = new CloudflareTurnCredentialProvider(
      { keyId: "key-123", apiToken: "token-abc", ttlSeconds: 3600 },
      () => 1_700_000_000_000,
      fakeFetch,
    );

    const first = await provider.getServers();
    const second = await provider.getServers();

    // Everything Cloudflare returns is passed through, including their STUN
    // entry, which gives STUN redundancy if another resolver is blocked.
    expect(first).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
      {
        urls: [
          "turn:turn.cloudflare.com:3478?transport=udp",
          "turns:turn.cloudflare.com:5349?transport=tcp",
        ],
        username: "a".repeat(128),
        credential: "b".repeat(64),
      },
    ]);
    expect(second).toEqual(first);
    // A second join must not spend another API call.
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(calls[0]?.url).toBe(
      "https://rtc.live.cloudflare.com/v1/turn/keys/key-123/credentials/generate-ice-servers",
    );
    expect(calls[0]?.init?.method).toBe("POST");
    expect(
      (calls[0]?.init?.headers as Record<string, string>).Authorization,
    ).toBe("Bearer token-abc");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ ttl: 3600 }));
  });

  it("applies the default TTL and still caches when the caller omits it", async () => {
    const requests: { init: RequestInit | undefined }[] = [];
    const fakeFetch = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      requests.push({ init });
      return Promise.resolve(
        new Response(JSON.stringify(CLOUDFLARE_RESPONSE), { status: 201 }),
      );
    });
    const provider = new CloudflareTurnCredentialProvider(
      { keyId: "key-123", apiToken: "token-abc" },
      () => 1_700_000_000_000,
      fakeFetch,
    );

    const first = await provider.getServers();
    const second = await provider.getServers();

    expect(second).toEqual(first);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    // An absent TTL must never reach the API as undefined, which would leave
    // the cache expiry uncomputable.
    expect(requests[0]?.init?.body).toBe(JSON.stringify({ ttl: 86_400 }));
  });

  it("refetches once the cached credential is close to expiring", async () => {
    let clock = 1_700_000_000_000;
    const fakeFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(CLOUDFLARE_RESPONSE), { status: 201 }),
      ),
    );
    const provider = new CloudflareTurnCredentialProvider(
      { keyId: "key-123", apiToken: "token-abc", ttlSeconds: 3600 },
      () => clock,
      fakeFetch,
    );

    await provider.getServers();
    clock += 3_300_000;
    await provider.getServers();
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  it("rejects a non-success response so the caller can degrade", async () => {
    const fakeFetch = vi.fn(() =>
      Promise.resolve(new Response("nope", { status: 403 })),
    );
    const provider = new CloudflareTurnCredentialProvider(
      { keyId: "key-123", apiToken: "bad", ttlSeconds: 3600 },
      () => 1_700_000_000_000,
      fakeFetch,
    );

    await expect(provider.getServers()).rejects.toThrow(/status 403/);
  });

  it("rejects a malformed response body", async () => {
    const fakeFetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ nope: true }), { status: 201 })),
    );
    const provider = new CloudflareTurnCredentialProvider(
      { keyId: "key-123", apiToken: "token-abc", ttlSeconds: 3600 },
      () => 1_700_000_000_000,
      fakeFetch,
    );

    await expect(provider.getServers()).rejects.toThrow(/no iceServers/);
  });
});

describe("normalizeCloudflareTtlSeconds", () => {
  it("defaults to 24 hours and clamps to the 48 hour maximum", () => {
    expect(normalizeCloudflareTtlSeconds(undefined)).toBe(86_400);
    expect(normalizeCloudflareTtlSeconds(Number.NaN)).toBe(86_400);
    expect(normalizeCloudflareTtlSeconds(10)).toBe(300);
    expect(normalizeCloudflareTtlSeconds(999_999)).toBe(172_800);
    expect(normalizeCloudflareTtlSeconds(3600)).toBe(3600);
  });
});
