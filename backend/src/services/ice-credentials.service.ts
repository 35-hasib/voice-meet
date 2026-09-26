import { createHmac } from "node:crypto";
import type { MeetingService } from "./meeting.service.js";
import type { AppLogger } from "../types/logger.js";
import type { IceServer } from "../types/api.js";

export const TURN_CREDENTIAL_TTL_SECONDS = 300;

export interface TurnConfig {
  urls: string[];
  usernamePrefix: string;
  sharedSecret: string;
}

export interface CloudflareTurnConfig {
  keyId: string;
  apiToken: string;
  /**
   * Optional on purpose: the provider owns the default and clamp so a caller
   * that omits it can never silently disable credential caching.
   */
  ttlSeconds?: number;
}

/**
 * Supplies relay servers for a meeting. Implementations either derive
 * credentials locally from a shared secret (coturn auth-secret mode) or delegate
 * to a hosted provider's credential API.
 */
export interface TurnCredentialProvider {
  getServers(): Promise<IceServer[]>;
}

/**
 * TURN REST API scheme used by coturn's `--use-auth-secret`: the username is
 * `<expiry>:<identifier>` and the password is `base64(HMAC-SHA1(secret, username))`.
 */
export class StaticTurnCredentialProvider implements TurnCredentialProvider {
  public constructor(
    private readonly config: TurnConfig,
    private readonly nowMilliseconds: () => number = Date.now,
  ) {}

  public getServers(): Promise<IceServer[]> {
    const expiresAt =
      Math.floor(this.nowMilliseconds() / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
    // The TURN server reads the text before the first colon as the expiry
    // timestamp. Putting the identifier first yields a non-numeric timestamp and
    // every allocation is refused as expired.
    const username = `${expiresAt.toString()}:${this.config.usernamePrefix}`;
    const credential = createHmac("sha1", this.config.sharedSecret)
      .update(username)
      .digest("base64");

    return Promise.resolve(
      this.config.urls.map((urls) => ({ urls, username, credential })),
    );
  }
}

export const CLOUDFLARE_CREDENTIAL_ENDPOINT_SUFFIX =
  "/v1/turn/keys/{keyId}/credentials/generate-ice-servers";
const CLOUDFLARE_API_BASE_URL = "https://rtc.live.cloudflare.com";
const CLOUDFLARE_DEFAULT_TTL_SECONDS = 86_400;
const CLOUDFLARE_MAX_TTL_SECONDS = 172_800;
const CLOUDFLARE_REQUEST_TIMEOUT_MS = 5_000;
/** Refresh this long before expiry so a long meeting never presents a dead credential. */
const CLOUDFLARE_EXPIRY_MARGIN_SECONDS = 300;

/**
 * Cloudflare issues TURN keys that cannot be used as credentials directly, so
 * credentials must be minted through their API. Results are cached for the
 * lifetime of the issued credential because a join should not cost an API call.
 */
export class CloudflareTurnCredentialProvider implements TurnCredentialProvider {
  private cached: { servers: IceServer[]; expiresAtSeconds: number } | null = null;

  private readonly ttlSeconds: number;

  public constructor(
    private readonly config: CloudflareTurnConfig,
    private readonly nowMilliseconds: () => number = Date.now,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    this.ttlSeconds = normalizeCloudflareTtlSeconds(config.ttlSeconds);
  }

  public async getServers(): Promise<IceServer[]> {
    const nowSeconds = Math.floor(this.nowMilliseconds() / 1000);

    if (
      this.cached !== null &&
      this.cached.expiresAtSeconds - CLOUDFLARE_EXPIRY_MARGIN_SECONDS > nowSeconds
    ) {
      return this.cached.servers;
    }

    const servers = await this.requestIceServers();
    this.cached = { servers, expiresAtSeconds: nowSeconds + this.ttlSeconds };

    return servers;
  }

  private async requestIceServers(): Promise<IceServer[]> {
    const endpoint = `${CLOUDFLARE_API_BASE_URL}${CLOUDFLARE_CREDENTIAL_ENDPOINT_SUFFIX.replace(
      "{keyId}",
      encodeURIComponent(this.config.keyId),
    )}`;
    const response = await this.fetchImplementation(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: this.ttlSeconds }),
      signal: AbortSignal.timeout(CLOUDFLARE_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Cloudflare TURN credential request failed with status ${String(response.status)}`);
    }

    const body: unknown = await response.json();

    return readIceServers(body);
  }
}

function readIceServers(body: unknown): IceServer[] {
  if (typeof body !== "object" || body === null || !("iceServers" in body)) {
    throw new Error("Cloudflare TURN credential response had no iceServers array");
  }

  const iceServers: unknown = body.iceServers;

  if (!Array.isArray(iceServers) || iceServers.length === 0) {
    throw new Error("Cloudflare TURN credential response had an empty iceServers array");
  }

  return iceServers.filter(
    (server): server is IceServer =>
      typeof server === "object" &&
      server !== null &&
      "urls" in server &&
      (typeof (server as IceServer).urls === "string" ||
        Array.isArray((server as IceServer).urls)),
  );
}

export function normalizeCloudflareTtlSeconds(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return CLOUDFLARE_DEFAULT_TTL_SECONDS;
  }

  return Math.min(Math.max(Math.trunc(value), 300), CLOUDFLARE_MAX_TTL_SECONDS);
}

export class IceCredentialsService {
  public constructor(
    private readonly meetingService: MeetingService,
    private readonly turnProvider: TurnCredentialProvider | null,
    private readonly stunUrls: string[],
    private readonly logger?: AppLogger,
  ) {}

  public async getIceServers(meetingCode: unknown): Promise<IceServer[]> {
    await this.meetingService.getActiveMeeting(meetingCode);
    const iceServers: IceServer[] = this.stunUrls.map((urls) => ({ urls }));

    if (this.turnProvider === null) {
      return iceServers;
    }

    try {
      iceServers.push(...(await this.turnProvider.getServers()));
    } catch (error: unknown) {
      // A relay outage must not stop peers from joining, so fall back to STUN
      // rather than failing the request.
      this.logger?.error("TURN credential lookup failed; serving STUN only", error);
    }

    return iceServers;
  }
}
