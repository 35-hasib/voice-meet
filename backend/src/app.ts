import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { RateLimitRequestHandler } from "express-rate-limit";
import { defaultLogger } from "./config/logger.js";
import { MeetingController } from "./controllers/meeting.controller.js";
import { RtcCredentialsController } from "./controllers/rtc-credentials.controller.js";
import { createErrorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import {
  createApiRateLimiter,
  createMeetingCreationRateLimiter,
} from "./middleware/rate-limit.js";
import { createHealthRouter, healthHandler } from "./routes/health.routes.js";
import { createMeetingRouter } from "./routes/meeting.routes.js";
import { createRtcRouter } from "./routes/rtc.routes.js";
import type { IceCredentialsService } from "./services/ice-credentials.service.js";
import type { MeetingService } from "./services/meeting.service.js";
import { AppError } from "./types/errors.js";
import type { AppLogger } from "./types/logger.js";

export interface AppDependencies {
  meetingService: MeetingService;
  credentialsService: IceCredentialsService;
  frontendUrls: string[];
  logger?: AppLogger;
  apiRateLimiter?: RateLimitRequestHandler;
  meetingCreationRateLimiter?: RateLimitRequestHandler;
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();
  const allowedOrigins = new Set(dependencies.frontendUrls);
  const logger = dependencies.logger ?? defaultLogger;
  const apiRateLimiter =
    dependencies.apiRateLimiter ?? createApiRateLimiter();
  const meetingCreationRateLimiter =
    dependencies.meetingCreationRateLimiter ??
    createMeetingCreationRateLimiter();
  const meetingController = new MeetingController(dependencies.meetingService, logger);
  const rtcController = new RtcCredentialsController(
    dependencies.credentialsService,
  );

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (origin === undefined || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }

        callback(
          new AppError(
            403,
            "CORS_ORIGIN_DENIED",
            "Origin is not allowed",
          ),
        );
      },
      methods: ["GET", "POST", "OPTIONS"],
      credentials: false,
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.get("/api/health", healthHandler);
  app.use("/api", apiRateLimiter);
  app.use("/health", createHealthRouter());
  app.use("/api/meetings", createMeetingRouter(
    meetingController,
    meetingCreationRateLimiter,
  ));
  app.use("/api/rtc", createRtcRouter(rtcController));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
