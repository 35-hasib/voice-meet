import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { MeetingService } from "../services/meeting.service.js";
import type { AppLogger } from "../types/logger.js";
import { MeetingSocketService } from "./meeting-socket.service.js";
import { ParticipantStore } from "./participant-store.js";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./types.js";

export const SOCKET_MAX_HTTP_BUFFER_SIZE = 64 * 1024;

export interface SocketServerDependencies {
  meetingService: MeetingService;
  frontendUrls: string[];
  logger: AppLogger;
  participantStore?: ParticipantStore;
}

export function createSocketServer(
  httpServer: HttpServer,
  dependencies: SocketServerDependencies,
): Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
> {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: [...dependencies.frontendUrls],
      methods: ["GET", "POST"],
      credentials: false,
    },
    maxHttpBufferSize: SOCKET_MAX_HTTP_BUFFER_SIZE,
    serveClient: false,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });
  const socketService = new MeetingSocketService(
    dependencies.meetingService,
    dependencies.participantStore ?? new ParticipantStore(),
    io,
    dependencies.logger,
  );

  io.on("connection", (socket) => {
    socketService.register(socket);
  });

  return io;
}
