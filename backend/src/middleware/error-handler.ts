import type { ErrorRequestHandler, Response } from "express";
import type { AppLogger } from "../types/logger.js";
import type { ApiErrorBody } from "../types/api.js";
import { AppError } from "../types/errors.js";

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const candidate = error as Record<string, unknown>;
  return typeof candidate.status === "number" ? candidate.status : undefined;
}

function errorType(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const candidate = error as Record<string, unknown>;
  return typeof candidate.type === "string" ? candidate.type : undefined;
}

function errorResponse(
  response: Response,
  statusCode: number,
  code: string,
  message: string,
): void {
  const body: ApiErrorBody = { error: { code, message } };
  response.status(statusCode).json(body);
}

export function createErrorHandler(logger: AppLogger): ErrorRequestHandler {
  return (error: unknown, _request, response, next): void => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error instanceof AppError) {
      errorResponse(response, error.statusCode, error.code, error.message);
      return;
    }

    if (errorType(error) === "entity.too.large") {
      errorResponse(response, 413, "PAYLOAD_TOO_LARGE", "Request body is too large");
      return;
    }

    if (errorType(error) === "entity.parse.failed") {
      errorResponse(response, 400, "INVALID_JSON", "Request body must be valid JSON");
      return;
    }

    const status = errorStatus(error);

    if (status === 400) {
      errorResponse(response, 400, "INVALID_REQUEST", "Invalid request");
      return;
    }

    logger.error("Unhandled request error", error);
    errorResponse(response, 500, "INTERNAL_ERROR", "Internal server error");
  };
}
