import { API_BASE_URL, SERVICE_NOT_CONFIGURED_MESSAGE } from "./config";
import type { ApiErrorBody } from "@/types/meeting";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_ERROR_MESSAGE = "Unable to connect to the server.";

export class ApiClientError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function statusCodeToCode(status: number): string {
  if (status === 404) {
    return "MEETING_NOT_FOUND";
  }

  if (status === 410) {
    return "MEETING_CLOSED";
  }

  if (status === 429) {
    return "RATE_LIMITED";
  }

  return "REQUEST_FAILED";
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (API_BASE_URL === null) {
    throw new ApiClientError("SERVICE_NOT_CONFIGURED", SERVICE_NOT_CONFIGURED_MESSAGE, 0);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
      signal: controller.signal,
    });

    const rawBody = await response.text();
    let body: unknown = null;

    if (rawBody.length > 0) {
      try {
        body = JSON.parse(rawBody) as unknown;
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      const errorBody = body as Partial<ApiErrorBody> | null;
      const message =
        errorBody?.error?.message ?? statusCodeToCode(response.status).replaceAll("_", " ").toLowerCase();

      throw new ApiClientError(
        errorBody?.error?.code ?? statusCodeToCode(response.status),
        message.length > 0 ? message : DEFAULT_ERROR_MESSAGE,
        response.status,
      );
    }

    return body as T;
  } catch (error: unknown) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiClientError("REQUEST_TIMEOUT", "The server took too long to respond.", 0);
    }

    throw new ApiClientError("NETWORK_ERROR", DEFAULT_ERROR_MESSAGE, 0);
  } finally {
    clearTimeout(timeout);
  }
}
