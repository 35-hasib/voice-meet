import { Router } from "express";
import type { RateLimitRequestHandler } from "express-rate-limit";
import type { MeetingController } from "../controllers/meeting.controller.js";

export function createMeetingRouter(
  controller: MeetingController,
  createMeetingLimiter: RateLimitRequestHandler,
): Router {
  const router = Router();
  router.post("/", createMeetingLimiter, controller.create);
  router.get("/:meetingCode", controller.getByCode);
  return router;
}
