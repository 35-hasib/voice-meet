import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

const DATABASE_URL = "postgresql://user:password@localhost:5432/voice_meet";
const FRONTEND_URL = "http://localhost:3000";

describe("environment configuration", () => {
  it("requires database and frontend URLs", () => {
    expect(() => loadConfig({})).toThrow(
      /DATABASE_URL.*FRONTEND_URL|FRONTEND_URL.*DATABASE_URL/,
    );
  });

  it("parses exact comma-separated origins and the default port", () => {
    const config = loadConfig({
      DATABASE_URL,
      FRONTEND_URL:
        "http://localhost:3000, https://voice.example.com/",
    });

    expect(config.port).toBe(4000);
    expect(config.frontendUrls).toEqual([
      "http://localhost:3000",
      "https://voice.example.com",
    ]);
  });

  it("rejects wildcard CORS configuration", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL,
        FRONTEND_URL: "*",
      }),
    ).toThrow(/wildcard/i);
  });

  it("accepts a bare origin with or without a trailing slash", () => {
    const config = loadConfig({
      DATABASE_URL,
      FRONTEND_URL: "https://voice.example.com/,https://app.vercel.app",
    });

    expect(config.frontendUrls).toEqual([
      "https://voice.example.com",
      "https://app.vercel.app",
    ]);
  });

  it("names the offending entry and the reason it is invalid", () => {    expect(() =>
      loadConfig({
        DATABASE_URL,
        FRONTEND_URL: "https://app.vercel.app/meet/abc123",
      }),
    ).toThrow(/entry "https:\/\/app\.vercel\.app\/meet\/abc123".*must not contain the path/s);

    expect(() =>
      loadConfig({
        DATABASE_URL,
        FRONTEND_URL: "voice-meet-xxx.vercel.app",
      }),
    ).toThrow(/entry "voice-meet-xxx\.vercel\.app" is not a valid URL/);

    expect(() =>
      loadConfig({
        DATABASE_URL,
        FRONTEND_URL: "https://user:pass@app.vercel.app",
      }),
    ).toThrow(/must not contain a username or password/);

    expect(() =>
      loadConfig({
        DATABASE_URL,
        FRONTEND_URL: "https://app.vercel.app?utm=x",
      }),
    ).toThrow(/must not contain a query string/);
  });

  it("requires complete TURN REST configuration", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL,
        FRONTEND_URL: "http://localhost:3000",
        TURN_SERVER_URL: "turn:turn.example.com:3478",
      }),
    ).toThrow(/must be configured together/i);
  });

  it("accepts STUN URLs with and without an authority component", () => {
    const config = loadConfig({
      DATABASE_URL,
      FRONTEND_URL: "http://localhost:3000",
      STUN_SERVER_URL:
        "stun:stun.l.google.com:19302, stun://stun1.example.com:3478, stun:stun.example.com",
    });

    expect(config.stunUrls).toEqual([
      "stun:stun.l.google.com:19302",
      "stun://stun1.example.com:3478",
      "stun:stun.example.com",
    ]);
  });

  it("keeps TURN URLs verbatim in both forms", () => {
    const config = loadConfig({
      DATABASE_URL,
      FRONTEND_URL: "http://localhost:3000",
      TURN_SERVER_URL: "turn:turn.example.com:3478?transport=udp,turns://turn.example.com:5349",
      TURN_SERVER_USERNAME: "audiomeet",
      TURN_SERVER_CREDENTIAL: "shared-secret",
    });

    expect(config.turn?.urls).toEqual([
      "turn:turn.example.com:3478?transport=udp",
      "turns://turn.example.com:5349",
    ]);
  });

  it("rejects STUN entries that embed credentials", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL,
        FRONTEND_URL: "http://localhost:3000",
        STUN_SERVER_URL: "stun://user:secret@stun.example.com:3478",
      }),
    ).toThrow(/without embedded credentials/i);
  });

  it("rejects STUN entries that use a non-STUN scheme", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL,
        FRONTEND_URL: "http://localhost:3000",
        STUN_SERVER_URL: "https://stun.example.com:3478",
      }),
    ).toThrow(/valid ICE URLs/i);
  });
  it("selects the Cloudflare TURN provider and defaults its TTL", () => {
    const config = loadConfig({
      DATABASE_URL,
      FRONTEND_URL,
      TURN_PROVIDER: "cloudflare",
      CLOUDFLARE_TURN_KEY_ID: "key-123",
      CLOUDFLARE_TURN_API_TOKEN: "token-abc",
    });

    expect(config.turnProviderKind).toBe("cloudflare");
    expect(config.cloudflareTurn).toStrictEqual({
      keyId: "key-123",
      apiToken: "token-abc",
      ttlSeconds: 86_400,
    });
    expect(config.turn).toBeNull();
  });

  it("accepts an explicit Cloudflare TTL", () => {
    const config = loadConfig({
      DATABASE_URL,
      FRONTEND_URL,
      TURN_PROVIDER: "cloudflare",
      CLOUDFLARE_TURN_KEY_ID: "key-123",
      CLOUDFLARE_TURN_API_TOKEN: "token-abc",
      CLOUDFLARE_TURN_TTL_SECONDS: "3600",
    });

    expect(config.cloudflareTurn?.ttlSeconds).toBe(3600);
  });

  it("rejects incomplete or ambiguous TURN provider configuration", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL,
        FRONTEND_URL,
        TURN_PROVIDER: "cloudflare",
        CLOUDFLARE_TURN_KEY_ID: "key-123",
      }),
    ).toThrow(/must be configured together/);

    expect(() =>
      loadConfig({
        DATABASE_URL,
        FRONTEND_URL,
        TURN_PROVIDER: "cloudflare",
      }),
    ).toThrow(/requires CLOUDFLARE_TURN_KEY_ID/);

    expect(() =>
      loadConfig({
        DATABASE_URL,
        FRONTEND_URL,
        CLOUDFLARE_TURN_KEY_ID: "key-123",
        CLOUDFLARE_TURN_API_TOKEN: "token-abc",
      }),
    ).toThrow(/requires TURN_PROVIDER=cloudflare/);

    expect(() =>
      loadConfig({
        DATABASE_URL,
        FRONTEND_URL,
        TURN_PROVIDER: "cloudflare",
        CLOUDFLARE_TURN_KEY_ID: "key-123",
        CLOUDFLARE_TURN_API_TOKEN: "token-abc",
        TURN_SERVER_URL: "turn:turn.example.com:3478",
        TURN_SERVER_USERNAME: "voice-meet",
        TURN_SERVER_CREDENTIAL: "secret",
      }),
    ).toThrow(/cannot be combined/);

    expect(() =>
      loadConfig({
        DATABASE_URL,
        FRONTEND_URL,
        TURN_PROVIDER: "twilio",
      }),
    ).toThrow(/must be "static" or "cloudflare"/);
  });

  it("keeps the static provider as the default for coturn variables", () => {
    const config = loadConfig({
      DATABASE_URL,
      FRONTEND_URL,
      TURN_SERVER_URL: "turn:turn.example.com:3478",
      TURN_SERVER_USERNAME: "voice-meet",
      TURN_SERVER_CREDENTIAL: "secret",
    });

    expect(config.turnProviderKind).toBe("static");
    expect(config.turn?.usernamePrefix).toBe("voice-meet");
    expect(config.cloudflareTurn).toBeNull();
  });
});
