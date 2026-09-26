import { Router } from "express";
import type { RtcCredentialsController } from "../controllers/rtc-credentials.controller.js";

export function createRtcRouter(controller: RtcCredentialsController): Router {
  const router = Router();
  router.get("/credentials", controller.getCredentials);
  return router;
}
