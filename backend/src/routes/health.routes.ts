import { Router } from "express";
import type { Request, Response } from "express";

export const SERVICE_NAME = "voice-meet-api";

/**
 * Liveness probe. It intentionally touches no database, cache, or socket state so
 * it answers immediately; a slow response here means the Node process itself is
 * unhealthy (for example a cold start), not the database.
 */
export function healthHandler(_request: Request, response: Response): void {
  response.status(200).json({ status: "ok", service: SERVICE_NAME });
}

export function createHealthRouter(): Router {
  const router = Router();
  router.get("/", healthHandler);
  return router;
}
