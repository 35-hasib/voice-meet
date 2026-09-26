import type { Server, Socket } from "socket.io";
import type { MeetingService } from "../services/meeting.service.js";
import { AppError } from "../types/errors.js";
import type { AppLogger } from "../types/logger.js";
import { SocketRateLimiter } from "./rate-limit.js";
import type {
  ParticipantMembership,
  ParticipantStore,
} from "./participant-store.js";
import {
  answerSchema,
  iceCandidateSchema,
  meetingJoinSchema,
  offerSchema,
  participantStateSchema,
} from "./schemas.js";
import type {
  ClientToServerEvents,
  ForwardedAnswerPayload,
  ForwardedIceCandidatePayload,
  ForwardedOfferPayload,
  InterServerEvents,
  JoinMeetingAcknowledgement,
  JoinMeetingPayload,
  OfferPayload,
  AnswerPayload,
  IceCandidatePayload,
  ParticipantStatePayload,
  ServerToClientEvents,
  SocketData,
} from "./types.js";

type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

function roomName(meetingCode: string): string {
  return `meeting:${meetingCode}`;
}

function internalError(): JoinMeetingAcknowledgement {
  return {
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Unable to join meeting",
    },
  };
}

function invalidJoinError(): JoinMeetingAcknowledgement {
  return {
    ok: false,
    error: {
      code: "INVALID_JOIN_PAYLOAD",
      message: "Meeting code or display name is invalid",
    },
  };
}

function socketError(error: unknown): JoinMeetingAcknowledgement {
  if (error instanceof AppError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }

  return internalError();
}

function publicParticipant(membership: ParticipantMembership): {
  participantId: string;
  displayName: string;
  muted: boolean;
} {
  return {
    participantId: membership.participantId,
    displayName: membership.displayName,
    muted: membership.muted,
  };
}

export class MeetingSocketService {
  public constructor(
    private readonly meetingService: MeetingService,
    private readonly participants: ParticipantStore,
    private readonly io: AppServer,
    private readonly logger: AppLogger,
    private readonly rateLimiter: SocketRateLimiter = new SocketRateLimiter(),
  ) {}

  public register(socket: AppSocket): void {
    socket.on("meeting:join", (payload, acknowledgement) => {
      if (!this.rateLimiter.allow(socket.id, "join")) {
        acknowledgement?.({
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many join attempts",
          },
        });
        return;
      }

      void this.joinSocket(socket, payload, acknowledgement);
    });
    socket.on("meeting:leave", () => {
      void this.leaveSocket(socket).catch((error: unknown) => {
        this.logger.error("Socket meeting leave failed", error);
      });
    });
    socket.on("disconnecting", () => {
      this.rateLimiter.reset(socket.id);
      void this.leaveSocket(socket).catch((error: unknown) => {
        this.logger.error("Socket disconnect cleanup failed", error);
      });
    });
    socket.on("webrtc:offer", (payload) => {
      if (this.rateLimiter.allow(socket.id, "signal")) {
        this.forwardOffer(socket, payload);
      }
    });
    socket.on("webrtc:answer", (payload) => {
      if (this.rateLimiter.allow(socket.id, "signal")) {
        this.forwardAnswer(socket, payload);
      }
    });
    socket.on("webrtc:ice-candidate", (payload) => {
      if (this.rateLimiter.allow(socket.id, "signal")) {
        this.forwardIceCandidate(socket, payload);
      }
    });
    socket.on("participant:state", (payload) => {
      if (this.rateLimiter.allow(socket.id, "signal")) {
        this.updateParticipantState(socket, payload);
      }
    });
  }

  public leaveParticipant(socketId: string): ParticipantMembership | null {
    return this.participants.removeBySocketId(socketId);
  }

  public async leaveSocket(socket: AppSocket): Promise<void> {
    const membership = this.leaveParticipant(socket.id);

    if (membership === null) {
      return;
    }

    try {
      await socket.leave(roomName(membership.meetingCode));
    } finally {
      socket
        .to(roomName(membership.meetingCode))
        .emit("participant:left", {
          participantId: membership.participantId,
        });
    }
  }

  private async joinSocket(
    socket: AppSocket,
    payload: JoinMeetingPayload,
    acknowledgement?: (result: JoinMeetingAcknowledgement) => void,
  ): Promise<void> {
    const parsed = meetingJoinSchema.safeParse(payload);

    if (!parsed.success) {
      acknowledgement?.(invalidJoinError());
      return;
    }

    if (this.participants.getBySocketId(socket.id) !== null) {
      acknowledgement?.({
        ok: false,
        error: {
          code: "ALREADY_JOINED",
          message: "Socket has already joined a meeting",
        },
      });
      return;
    }

    try {
      await this.meetingService.getActiveMeeting(parsed.data.meetingCode);
      await socket.join(roomName(parsed.data.meetingCode));

      let membership: ParticipantMembership;

      try {
        membership = this.participants.add(
          socket.id,
          parsed.data.meetingCode,
          parsed.data.displayName,
        );
      } catch (error: unknown) {
        await socket.leave(roomName(parsed.data.meetingCode));
        throw error;
      }

      socket
        .to(roomName(membership.meetingCode))
        .emit("participant:joined", publicParticipant(membership));
      socket.emit("meeting:joined", {
        self: publicParticipant(membership),
        participants: this.participants.list(
          membership.meetingCode,
          membership.participantId,
        ),
      });
      acknowledgement?.({ ok: true });
    } catch (error: unknown) {
      this.logger.error("Socket meeting join failed", error);
      acknowledgement?.(socketError(error));
    }
  }

  private signalTarget(
    sender: ParticipantMembership,
    targetParticipantId: string,
  ): ParticipantMembership | null {
    if (sender.participantId === targetParticipantId) {
      return null;
    }

    return this.participants.getByParticipantId(
      sender.meetingCode,
      targetParticipantId,
    );
  }

  private forwardOffer(socket: AppSocket, payload: OfferPayload): void {
    const parsed = offerSchema.safeParse(payload);

    if (!parsed.success) {
      return;
    }

    const sender = this.participants.getBySocketId(socket.id);
    const target =
      sender === null
        ? null
        : this.signalTarget(sender, parsed.data.targetParticipantId);

    if (sender === null || target === null) {
      return;
    }

    const forwarded: ForwardedOfferPayload = {
      targetParticipantId: parsed.data.targetParticipantId,
      participantId: sender.participantId,
      sdp: parsed.data.sdp,
    };
    this.io.to(target.socketId).emit("webrtc:offer", forwarded);
  }

  private forwardAnswer(socket: AppSocket, payload: AnswerPayload): void {
    const parsed = answerSchema.safeParse(payload);

    if (!parsed.success) {
      return;
    }

    const sender = this.participants.getBySocketId(socket.id);
    const target =
      sender === null
        ? null
        : this.signalTarget(sender, parsed.data.targetParticipantId);

    if (sender === null || target === null) {
      return;
    }

    const forwarded: ForwardedAnswerPayload = {
      targetParticipantId: parsed.data.targetParticipantId,
      participantId: sender.participantId,
      sdp: parsed.data.sdp,
    };
    this.io.to(target.socketId).emit("webrtc:answer", forwarded);
  }

  private forwardIceCandidate(
    socket: AppSocket,
    payload: IceCandidatePayload,
  ): void {
    const parsed = iceCandidateSchema.safeParse(payload);

    if (!parsed.success) {
      return;
    }

    const sender = this.participants.getBySocketId(socket.id);
    const target =
      sender === null
        ? null
        : this.signalTarget(sender, parsed.data.targetParticipantId);

    if (sender === null || target === null) {
      return;
    }

    const forwarded: ForwardedIceCandidatePayload = {
      targetParticipantId: parsed.data.targetParticipantId,
      participantId: sender.participantId,
      candidate: parsed.data.candidate,
      ...(parsed.data.sdpMid === undefined
        ? {}
        : { sdpMid: parsed.data.sdpMid }),
      ...(parsed.data.sdpMLineIndex === undefined
        ? {}
        : { sdpMLineIndex: parsed.data.sdpMLineIndex }),
      ...(parsed.data.usernameFragment === undefined
        ? {}
        : { usernameFragment: parsed.data.usernameFragment }),
    };
    this.io.to(target.socketId).emit("webrtc:ice-candidate", forwarded);
  }

  private updateParticipantState(
    socket: AppSocket,
    payload: ParticipantStatePayload,
  ): void {
    const parsed = participantStateSchema.safeParse(payload);

    if (!parsed.success) {
      return;
    }

    const membership = this.participants.setMuted(
      socket.id,
      parsed.data.muted,
    );

    if (membership === null) {
      return;
    }

    this.io.to(roomName(membership.meetingCode)).emit("participant:state", {
      participantId: membership.participantId,
      muted: membership.muted,
    });
  }
}
