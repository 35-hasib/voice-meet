export type SocketRateLimitCategory = "join" | "signal";

export interface SocketRateLimitPolicy {
  category: SocketRateLimitCategory;
  limit: number;
  windowMs: number;
}

interface CategoryTimestamps {
  join: number[];
  signal: number[];
}

export const DEFAULT_SOCKET_RATE_LIMITS: readonly SocketRateLimitPolicy[] = [
  { category: "join", limit: 5, windowMs: 60_000 },
  { category: "signal", limit: 120, windowMs: 10_000 },
] as const;

export class SocketRateLimiter {
  private readonly timestamps = new Map<string, CategoryTimestamps>();

  public constructor(
    private readonly policies: readonly SocketRateLimitPolicy[] =
      DEFAULT_SOCKET_RATE_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  public allow(socketId: string, category: SocketRateLimitCategory): boolean {
    const policy = this.policies.find((item) => item.category === category);

    if (policy === undefined) {
      return false;
    }

    const now = this.now();
    const state = this.timestamps.get(socketId) ?? { join: [], signal: [] };
    const recent = state[category].filter(
      (timestamp) => now - timestamp < policy.windowMs,
    );

    if (recent.length >= policy.limit) {
      state[category] = recent;
      this.timestamps.set(socketId, state);
      return false;
    }

    recent.push(now);
    state[category] = recent;
    this.timestamps.set(socketId, state);
    return true;
  }

  public reset(socketId: string): void {
    this.timestamps.delete(socketId);
  }
}
