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

export const SERVICE_NOT_CONFIGURED_MESSAGE =
  "Unable to connect to the server. The backend address is not configured.";

export function isServiceConfigured(): boolean {
  return API_BASE_URL !== null && SOCKET_URL !== null;
}
