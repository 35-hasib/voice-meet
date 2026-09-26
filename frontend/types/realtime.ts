import type { ApiError } from "./meeting";

export interface JoinMeetingPayload {
  meetingCode: string;
  displayName: string;
}

export type JoinMeetingAcknowledgement =
  | { ok: true }
  | { ok: false; error: ApiError };

export interface OfferPayload {
  targetParticipantId: string;
  sdp: string;
}

export type AnswerPayload = OfferPayload;

export interface IceCandidatePayload {
  targetParticipantId: string;
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface ParticipantStatePayload {
  muted: boolean;
}

export interface MeetingJoinedPayload {
  self: {
    participantId: string;
    displayName: string;
    muted: boolean;
  };
  participants: Array<{
    participantId: string;
    displayName: string;
    muted: boolean;
  }>;
}

export interface ForwardedOfferPayload extends OfferPayload {
  participantId: string;
}

export type ForwardedAnswerPayload = ForwardedOfferPayload;

export interface ForwardedIceCandidatePayload extends IceCandidatePayload {
  participantId: string;
}

export interface ParticipantLeftPayload {
  participantId: string;
}

export interface ParticipantStateEvent extends ParticipantLeftPayload {
  muted: boolean;
}

export interface ClientToServerEvents {
  "meeting:join": (
    payload: JoinMeetingPayload,
    acknowledgement?: (result: JoinMeetingAcknowledgement) => void,
  ) => void;
  "meeting:leave": () => void;
  "webrtc:offer": (payload: OfferPayload) => void;
  "webrtc:answer": (payload: AnswerPayload) => void;
  "webrtc:ice-candidate": (payload: IceCandidatePayload) => void;
  "participant:state": (payload: ParticipantStatePayload) => void;
}

export interface ServerToClientEvents {
  "meeting:joined": (payload: MeetingJoinedPayload) => void;
  "participant:joined": (payload: MeetingJoinedPayload["self"]) => void;
  "participant:left": (payload: ParticipantLeftPayload) => void;
  "participant:state": (payload: ParticipantStateEvent) => void;
  "webrtc:offer": (payload: ForwardedOfferPayload) => void;
  "webrtc:answer": (payload: ForwardedAnswerPayload) => void;
  "webrtc:ice-candidate": (payload: ForwardedIceCandidatePayload) => void;
}

export type InterServerEvents = Record<string, never>;
