import type { ApiErrorBody } from "../types/api.js";

export interface Participant {
  participantId: string;
  displayName: string;
  muted: boolean;
}

export interface JoinMeetingPayload {
  meetingCode: string;
  displayName: string;
}

export type JoinMeetingAcknowledgement =
  | { ok: true }
  | { ok: false; error: ApiErrorBody["error"] };

export interface WebRtcSignalPayload {
  targetParticipantId: string;
}

export interface OfferPayload extends WebRtcSignalPayload {
  sdp: string;
}

export interface AnswerPayload extends WebRtcSignalPayload {
  sdp: string;
}

export interface IceCandidatePayload extends WebRtcSignalPayload {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface ParticipantStatePayload {
  muted: boolean;
}

export interface ForwardedWebRtcSignal {
  targetParticipantId: string;
  participantId: string;
}

export interface ForwardedOfferPayload extends ForwardedWebRtcSignal {
  sdp: string;
}

export interface ForwardedAnswerPayload extends ForwardedWebRtcSignal {
  sdp: string;
}

export interface ForwardedIceCandidatePayload extends ForwardedWebRtcSignal {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface MeetingJoinedPayload {
  self: Participant;
  participants: Participant[];
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
  "participant:joined": (participant: Participant) => void;
  "participant:left": (payload: ParticipantLeftPayload) => void;
  "participant:state": (payload: ParticipantStateEvent) => void;
  "webrtc:offer": (payload: ForwardedOfferPayload) => void;
  "webrtc:answer": (payload: ForwardedAnswerPayload) => void;
  "webrtc:ice-candidate": (
    payload: ForwardedIceCandidatePayload,
  ) => void;
}

export type InterServerEvents = Record<string, never>;
export type SocketData = Record<string, never>;
