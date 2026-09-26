import { randomBytes } from "node:crypto";
import type { Participant } from "./types.js";

export interface ParticipantMembership extends Participant {
  meetingCode: string;
  socketId: string;
}

interface ParticipantRoom {
  participants: Map<string, ParticipantMembership>;
}

export type ParticipantIdGenerator = () => string;

export function generateParticipantId(): string {
  return randomBytes(16).toString("base64url");
}

export class ParticipantStore {
  private readonly membershipsBySocket = new Map<
    string,
    ParticipantMembership
  >();
  private readonly rooms = new Map<string, ParticipantRoom>();

  public constructor(
    private readonly createParticipantId: ParticipantIdGenerator = generateParticipantId,
  ) {}

  public add(
    socketId: string,
    meetingCode: string,
    displayName: string,
  ): ParticipantMembership {
    if (this.membershipsBySocket.has(socketId)) {
      throw new Error("Socket is already in a meeting");
    }

    let room = this.rooms.get(meetingCode);

    if (room === undefined) {
      room = { participants: new Map() };
      this.rooms.set(meetingCode, room);
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const participantId = this.createParticipantId();

      if (room.participants.has(participantId)) {
        continue;
      }

      const membership: ParticipantMembership = {
        participantId,
        meetingCode,
        socketId,
        displayName,
        muted: false,
      };
      room.participants.set(participantId, membership);
      this.membershipsBySocket.set(socketId, membership);
      return membership;
    }

    if (room.participants.size === 0) {
      this.rooms.delete(meetingCode);
    }
    throw new Error("Unable to assign a unique participant ID");
  }

  public getBySocketId(socketId: string): ParticipantMembership | null {
    return this.membershipsBySocket.get(socketId) ?? null;
  }

  public getByParticipantId(
    meetingCode: string,
    participantId: string,
  ): ParticipantMembership | null {
    return this.rooms.get(meetingCode)?.participants.get(participantId) ?? null;
  }

  public list(meetingCode: string, excludedParticipantId?: string): Participant[] {
    const participants = this.rooms.get(meetingCode)?.participants.values() ?? [];
    return [...participants]
      .filter(
        (participant) => participant.participantId !== excludedParticipantId,
      )
      .map(({ participantId, displayName, muted }) => ({
        participantId,
        displayName,
        muted,
      }));
  }

  public setMuted(socketId: string, muted: boolean): ParticipantMembership | null {
    const membership = this.membershipsBySocket.get(socketId);

    if (membership === undefined) {
      return null;
    }

    membership.muted = muted;
    return membership;
  }

  public removeBySocketId(socketId: string): ParticipantMembership | null {
    const membership = this.membershipsBySocket.get(socketId);

    if (membership === undefined) {
      return null;
    }

    this.membershipsBySocket.delete(socketId);
    const room = this.rooms.get(membership.meetingCode);
    room?.participants.delete(membership.participantId);

    if (room?.participants.size === 0) {
      this.rooms.delete(membership.meetingCode);
    }

    return membership;
  }
}
