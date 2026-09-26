import request, { type Response } from "supertest";
import { describe, expect, it } from "vitest";
import type { Express } from "express";
import { createApp } from "../src/app.js";
import { IceCredentialsService } from "../src/services/ice-credentials.service.js";
import { MeetingService } from "../src/services/meeting.service.js";
import { FakeMeetingRepository } from "./support/fake-meeting.repository.js";

const FRONTEND_URL = "http://localhost:3000";
const MEETING_CODE = "AAAAAAAAAAAA";

function bodyOf(response: Response): unknown {
  const body: unknown = response.body;
  return body;
}

function createTestApp(repository: FakeMeetingRepository): Express {
  let meetingNumber = 0;
  const meetingService = new MeetingService(repository, () => {
    meetingNumber += 1;
    return `A${meetingNumber.toString().padStart(11, "0")}`;
  });
  const credentialsService = new IceCredentialsService(
    meetingService,
    null,
    ["stun:stun.example.com:3478"],
  );

  return createApp({
    meetingService,
    credentialsService,
    frontendUrls: [FRONTEND_URL],
    logger: { info: () => undefined, error: () => undefined },
  });
}

describe("meeting API", () => {
  it("creates and gets a meeting with raw JSON", async () => {
    const repository = new FakeMeetingRepository();
    const app = createTestApp(repository);

    const created = await request(app).post("/api/meetings").send();
    const createdBody = bodyOf(created);

    expect(created.status).toBe(201);
    expect(createdBody).toStrictEqual({
      id: "meeting-1",
      meetingCode: "A00000000001",
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      closedAt: null,
    });

    const fetched = await request(app).get(
      `/api/meetings/${MEETING_CODE}`,
    );
    const fetchedBody = bodyOf(fetched);

    expect(fetched.status).toBe(404);
    expect(fetchedBody).toStrictEqual({
      error: {
        code: "MEETING_NOT_FOUND",
        message: "Meeting not found",
      },
    });
  });

  it("gets a seeded active meeting", async () => {
    const repository = new FakeMeetingRepository();
    const meeting = repository.seed(MEETING_CODE, "ACTIVE");
    const app = createTestApp(repository);

    const response = await request(app).get(`/api/meetings/${MEETING_CODE}`);

    expect(response.status).toBe(200);
    expect(bodyOf(response)).toStrictEqual({
      id: meeting.id,
      meetingCode: MEETING_CODE,
      status: "ACTIVE",
      createdAt: meeting.createdAt.toISOString(),
      updatedAt: meeting.updatedAt.toISOString(),
      closedAt: null,
    });
  });

  it("returns 400 for a malformed meeting code", async () => {
    const app = createTestApp(new FakeMeetingRepository());
    const response = await request(app).get("/api/meetings/not-valid");

    expect(response.status).toBe(400);
    expect(bodyOf(response)).toStrictEqual({
      error: {
        code: "INVALID_MEETING_CODE",
        message: "Meeting code must be 12 base64url characters",
      },
    });
  });

  it("returns 404 for an absent meeting", async () => {
    const app = createTestApp(new FakeMeetingRepository());
    const response = await request(app).get(`/api/meetings/${MEETING_CODE}`);

    expect(response.status).toBe(404);
    expect(bodyOf(response)).toStrictEqual({
      error: {
        code: "MEETING_NOT_FOUND",
        message: "Meeting not found",
      },
    });
  });

  it("returns 410 for a closed meeting", async () => {
    const repository = new FakeMeetingRepository();
    repository.seed(MEETING_CODE, "CLOSED");
    const app = createTestApp(repository);
    const response = await request(app).get(`/api/meetings/${MEETING_CODE}`);

    expect(response.status).toBe(410);
    expect(bodyOf(response)).toStrictEqual({
      error: {
        code: "MEETING_CLOSED",
        message: "Meeting is closed",
      },
    });
  });

  it("applies the dedicated meeting creation rate limit", async () => {
    const app = createTestApp(new FakeMeetingRepository());

    for (let requestNumber = 0; requestNumber < 10; requestNumber += 1) {
      const response = await request(app).post("/api/meetings").send();
      expect(response.status).toBe(201);
    }

    const limited = await request(app).post("/api/meetings").send();
    expect(limited.status).toBe(429);
    expect(bodyOf(limited)).toStrictEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many meeting creation requests",
      },
    });
  });

  it("uses an exact CORS allowlist and returns JSON errors", async () => {
    const app = createTestApp(new FakeMeetingRepository());
    const allowed = await request(app)
      .get("/health")
      .set("Origin", FRONTEND_URL);
    const denied = await request(app)
      .get("/health")
      .set("Origin", "https://evil.example.com");

    expect(allowed.headers["access-control-allow-origin"]).toBe(FRONTEND_URL);
    expect(denied.status).toBe(403);
    expect(bodyOf(denied)).toStrictEqual({
      error: {
        code: "CORS_ORIGIN_DENIED",
        message: "Origin is not allowed",
      },
    });
  });

  it("validates meetings before returning RTC credentials", async () => {
    const repository = new FakeMeetingRepository();
    repository.seed(MEETING_CODE, "ACTIVE");
    repository.seed("BBBBBBBBBBBB", "CLOSED");
    const app = createTestApp(repository);

    const activeResponse = await request(app).get(
      `/api/rtc/credentials?meetingCode=${MEETING_CODE}`,
    );
    const closedResponse = await request(app).get(
      "/api/rtc/credentials?meetingCode=BBBBBBBBBBBB",
    );

    expect(activeResponse.status).toBe(200);
    expect(bodyOf(activeResponse)).toStrictEqual({
      iceServers: [{ urls: "stun:stun.example.com:3478" }],
    });
    expect(closedResponse.status).toBe(410);
    expect(bodyOf(closedResponse)).toStrictEqual({
      error: {
        code: "MEETING_CLOSED",
        message: "Meeting is closed",
      },
    });
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const app = createTestApp(new FakeMeetingRepository());
    const response = await request(app).get("/unknown");

    expect(response.status).toBe(404);
    expect(bodyOf(response)).toStrictEqual({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "Route not found",
      },
    });
  });

  it("serves a fast liveness probe at /api/health and /health", async () => {
    const repository = new FakeMeetingRepository();
    const app = createTestApp(repository);
    const expected = { status: "ok", service: "voice-meet-api" };

    const apiHealth = await request(app).get("/api/health");
    expect(apiHealth.status).toBe(200);
    expect(bodyOf(apiHealth)).toStrictEqual(expected);

    const health = await request(app).get("/health");
    expect(health.status).toBe(200);
    expect(bodyOf(health)).toStrictEqual(expected);

    // The probe must not touch the database, so it performs no writes.
    expect(repository.createInputs).toHaveLength(0);
  });

  it("does not rate limit the liveness probe", async () => {
    const app = createTestApp(new FakeMeetingRepository());
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 320; attempt += 1) {
      const response = await request(app).get("/api/health");
      statuses.push(response.status);
    }

    expect(statuses.every((status) => status === 200)).toBe(true);
  });
});
