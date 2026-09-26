import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

const DATABASE_URL = "postgresql://user:password@localhost:5432/voice_meet";

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

  it("names the offending entry and the reason it is invalid", () => {
    expect(() =>
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
});
