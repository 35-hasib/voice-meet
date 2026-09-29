import "dotenv/config";
import { createServer, type Server as HttpServer } from "node:http";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { loadConfig, type AppConfig } from "./config/env.js";
import { defaultLogger } from "./config/logger.js";
import { PrismaMeetingRepository } from "./repositories/prisma-meeting.repository.js";
import {
  CloudflareTurnCredentialProvider,
  IceCredentialsService,
  StaticTurnCredentialProvider,
  type TurnCredentialProvider,
} from "./services/ice-credentials.service.js";
import { MeetingService } from "./services/meeting.service.js";
import { createSocketServer } from "./socket/index.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

function createTurnProvider(config: AppConfig): TurnCredentialProvider | null {
  if (config.turnProviderKind === "cloudflare" && config.cloudflareTurn !== null) {
    return new CloudflareTurnCredentialProvider(config.cloudflareTurn);
  }

  if (config.turnProviderKind === "static" && config.turn !== null) {
    return new StaticTurnCredentialProvider(config.turn);
  }

  return null;
}

async function closeSocketServer(
  io: ReturnType<typeof createSocketServer>,
): Promise<void> {
  await io.close();
}

/**
 * Stop accepting connections and wait for in-flight requests to finish.
 *
 * `io.close()` already closes the listener it was attached to, so this is a
 * safety net for the path where the socket close fails partway and leaves the
 * server listening. The `listening` guard matters: closing an already-closed
 * server reports `ERR_SERVER_NOT_RUNNING`, which would otherwise turn a clean
 * shutdown into a reported failure.
 */
function closeHttpServer(httpServer: HttpServer): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!httpServer.listening) {
      resolve();
      return;
    }

    httpServer.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const prisma = new PrismaClient();
  const connectStartedAt = process.hrtime.bigint();
  defaultLogger.info("Connecting to PostgreSQL");
  await prisma.$connect();
  const connectElapsedMs = Number(process.hrtime.bigint() - connectStartedAt) / 1e6;
  defaultLogger.info(
    `PostgreSQL connected in ${connectElapsedMs.toFixed(1)}ms`,
  );

  const repository = new PrismaMeetingRepository(prisma);
  const meetingService = new MeetingService(repository);
  const turnProvider = createTurnProvider(config);
  const credentialsService = new IceCredentialsService(
    meetingService,
    turnProvider,
    config.stunUrls,
    defaultLogger,
  );
  const turnProviderName: string =
    config.turnProviderKind ?? "disabled";
  defaultLogger.info(
    `TURN provider: ${turnProviderName}${turnProvider === null ? "" : " (enabled)"}`,
  );
  const app = createApp({
    meetingService,
    credentialsService,
    frontendUrls: config.frontendUrls,
    trustProxy: config.trustProxy,
    logger: defaultLogger,
  });
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer, {
    meetingService,
    frontendUrls: config.frontendUrls,
    logger: defaultLogger,
  });
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    defaultLogger.error(`Received ${signal}; shutting down`);

    // A hard deadline is armed first so a resource that refuses to close cannot
    // leave the process alive indefinitely, and it is disarmed only once every
    // close below has been attempted.
    const forceExit = setTimeout(() => {
      defaultLogger.error("Graceful shutdown timed out");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    let shutdownFailed = false;

    try {
      await closeSocketServer(io);
    } catch (error: unknown) {
      shutdownFailed = true;
      defaultLogger.error("Socket server shutdown failed", error);
    }

    // `io.close()` closes the listener it was attached to, but only on the path
    // where it succeeds. Closing it again here is a no-op in the normal case and
    // covers the path where the socket close failed partway.
    try {
      await closeHttpServer(httpServer);
    } catch (error: unknown) {
      shutdownFailed = true;
      defaultLogger.error("HTTP server shutdown failed", error);
    }

    try {
      await prisma.$disconnect();
    } catch (error: unknown) {
      shutdownFailed = true;
      defaultLogger.error("Database disconnect failed", error);
    }

    clearTimeout(forceExit);

    // Failure has to force the exit: the host is waiting on this process to go
    // away, and a resource that refused to close would otherwise keep the event
    // loop alive forever with only a non-zero exit code set. On success every
    // resource is closed, so the loop drains and the process ends on its own.
    if (shutdownFailed) {
      defaultLogger.error("Shutdown complete with errors");
      process.exit(1);
      return;
    }

    defaultLogger.error("Shutdown complete");
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error): void => {
        reject(error);
      };
      httpServer.once("error", handleError);
      httpServer.listen(config.port, "0.0.0.0", () => {
        httpServer.off("error", handleError);
        resolve();
      });
    });
  } catch (error: unknown) {
    await prisma.$disconnect();
    throw error;
  }

  process.stdout.write(
    `Voice Meet backend listening on port ${String(config.port)} (bound to 0.0.0.0, FRONTEND_URL=${config.frontendUrls.join(",")})\n`,
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  defaultLogger.error(`Startup failed: ${message}`);
  process.exitCode = 1;
});
