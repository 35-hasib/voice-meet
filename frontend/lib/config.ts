function normalizeBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();

  if (trimmed === undefined || trimmed.length === 0) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
}

function splitUrls(value: string | undefined): string[] {
  const trimmed = value?.trim();

  if (trimmed === undefined || trimmed.length === 0) {
    return [];
  }

  return [...new Set(trimmed.split(",").map((url) => url.trim()).filter(Boolean))];
}

export const API_BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL);
export const SOCKET_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_SOCKET_URL);
export const PUBLIC_STUN_URLS = splitUrls(process.env.NEXT_PUBLIC_STUN_SERVER_URL);

/**
 * Client-side request deadline. This must stay above the worst-case cold start of
 * the API host: a free-tier Render instance is suspended after a period of
 * inactivity and has to boot before it can answer, which regularly takes longer
 * than a typical 10-15s timeout. A too-short deadline turns a healthy server into
 * a misleading "the server took too long to respond" error.
 */
export const API_TIMEOUT_MS = readTimeoutMs(process.env.NEXT_PUBLIC_API_TIMEOUT_MS);

function readTimeoutMs(value: string | undefined): number {
  const fallback = 30_000;
  const parsed = Number(value);

  if (value === undefined || !Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), 5_000), 120_000);
}

export const SERVICE_NOT_CONFIGURED_MESSAGE =
  "Unable to connect to the server. The backend address is not configured.";

export function isServiceConfigured(): boolean {
  return API_BASE_URL !== null && SOCKET_URL !== null;
}
