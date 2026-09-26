import { describe, expect, it } from "vitest";
import { SocketRateLimiter } from "../src/socket/rate-limit.js";

describe("SocketRateLimiter", () => {
  it("limits join attempts inside the window and recovers afterwards", () => {
    let now = 0;
    const limiter = new SocketRateLimiter(undefined, () => now);

    expect(limiter.allow("socket-a", "join")).toBe(true);
    expect(limiter.allow("socket-a", "join")).toBe(true);
    now = 60_000;
    expect(limiter.allow("socket-a", "join")).toBe(true);
  });

  it("rejects events beyond the configured limit", () => {
    const limiter = new SocketRateLimiter([
      { category: "signal", limit: 2, windowMs: 1_000 },
    ]);

    expect(limiter.allow("socket-b", "signal")).toBe(true);
    expect(limiter.allow("socket-b", "signal")).toBe(true);
    expect(limiter.allow("socket-b", "signal")).toBe(false);
    expect(limiter.allow("socket-b", "join")).toBe(false);
  });

  it("keeps separate budgets per socket and resets on disconnect", () => {
    const limiter = new SocketRateLimiter([
      { category: "signal", limit: 1, windowMs: 1_000 },
    ]);

    expect(limiter.allow("socket-c", "signal")).toBe(true);
    expect(limiter.allow("socket-c", "signal")).toBe(false);
    expect(limiter.allow("socket-d", "signal")).toBe(true);
    limiter.reset("socket-c");
    expect(limiter.allow("socket-c", "signal")).toBe(true);
  });
});
