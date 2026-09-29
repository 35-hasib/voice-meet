"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SERVICE_NOT_CONFIGURED_MESSAGE, SOCKET_URL } from "@/lib/config";
import {
  CONNECTION_NOTICE_MESSAGE,
  isFailedConnection,
  isRecoveredConnection,
  shouldRetireConnectionNotice,
} from "@/lib/connection-notice";
import { resolveIceConfiguration, type ResolvedIceConfiguration } from "@/lib/ice-servers";
import type { Participant } from "@/types/meeting";
import type { RtcConnectionState } from "@/types/rtc";
import type {
  ClientToServerEvents,
  ForwardedAnswerPayload,
  ForwardedIceCandidatePayload,
  ForwardedOfferPayload,
  MeetingJoinedPayload,
  ParticipantLeftPayload,
  ParticipantStateEvent,
  ServerToClientEvents,
} from "@/types/realtime";

const JOIN_TIMEOUT_MS = 12_000;
const NO_LIVE_MICROPHONE_MESSAGE =
  "Your microphone stream is no longer available. Leave the meeting and rejoin to reconnect your audio.";

/**
 * STUN alone cannot traverse symmetric NAT or a network that blocks UDP, so
 * without a TURN server the peer connection silently fails to form and the user
 * only sees a stalled "connecting" state. Say so up front instead.
 */
function buildIceWarning(configuration: ResolvedIceConfiguration): string | null {
  if (configuration.hadCredentialsError) {
    return "No STUN or TURN server is available. Connections may fail on restrictive networks.";
  }

  if (!configuration.hasTurn) {
    return "No TURN relay is configured. You can connect on most networks, but peers behind a strict firewall or symmetric NAT may fail to connect.";
  }

  return null;
}

export type MeetingConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "degraded"
  | "failed"
  | "left";

export interface RemotePeer {
  participantId: string;
  stream: MediaStream | null;
  connectionState: RtcConnectionState;
}

interface PeerRecord {
  connection: RTCPeerConnection;
  remoteStream: MediaStream | null;
  pendingCandidates: RTCIceCandidateInit[];
}

type MeetingSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface AudioMeetingController {
  status: MeetingConnectionStatus;
  error: string | null;
  iceWarning: string | null;
  self: Participant | null;
  participants: Participant[];
  remotePeers: RemotePeer[];
  isMuted: boolean;
  audioBlocked: boolean;
  audioPlaybackVersion: number;
  start: () => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
  unlockAudio: () => void;
  reportAudioBlocked: () => void;
  reportAudioPlaying: () => void;
}

function joinErrorMessage(code: string): string {
  switch (code) {
    case "MEETING_NOT_FOUND":
      return "Sorry, this meeting doesn't exist.";
    case "MEETING_CLOSED":
      return "This meeting has been closed.";
    case "INVALID_JOIN_PAYLOAD":
      return "Enter a display name to join this meeting.";
    case "MEETING_FULL":
      return "This meeting is full. Please try again once someone leaves.";
    case "RATE_LIMITED":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "Unable to connect to the meeting.";
  }
}

function connectionStateFor(
  connection: RTCPeerConnection,
): RtcConnectionState {
  return connection.connectionState as RtcConnectionState;
}

export function useAudioMeeting(options: {
  meetingCode: string;
  displayName: string;
  stream: MediaStream;
}): AudioMeetingController {
  const { displayName, meetingCode, stream } = options;
  const [status, setStatus] = useState<MeetingConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [iceWarning, setIceWarning] = useState<string | null>(null);
  const [self, setSelf] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [isMuted, setIsMuted] = useState(
    stream.getAudioTracks()[0]?.enabled === false,
  );
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioPlaybackVersion, setAudioPlaybackVersion] = useState(0);
  const socketRef = useRef<MeetingSocket | null>(null);
  const peersRef = useRef(new Map<string, PeerRecord>());
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const streamRef = useRef<MediaStream>(stream);
  const selfRef = useRef<Participant | null>(null);
  const joinedRef = useRef(false);
  const leavingRef = useRef(false);
  const startingRef = useRef(false);
  const startTokenRef = useRef(0);
  const joinTimerRef = useRef<number | null>(null);
  const leaveRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  const refreshStatus = useCallback((): void => {
    if (leavingRef.current || !joinedRef.current) {
      return;
    }

    const peers = [...peersRef.current.values()];

    if (peers.some((peer) => peer.connection.connectionState === "failed")) {
      setStatus("degraded");
      return;
    }

    if (socketRef.current?.connected !== true) {
      setStatus("reconnecting");
      return;
    }

    if (
      peers.length === 0 ||
      peers.some((peer) => peer.connection.connectionState === "connected")
    ) {
      setStatus("connected");
      return;
    }

    setStatus("connecting");
  }, []);

  const syncRemotePeer = useCallback(
    (participantId: string, record: PeerRecord): void => {
      setRemotePeers((current) => {
        const existing = current.find(
          (peer) => peer.participantId === participantId,
        );
        const connectionState = connectionStateFor(record.connection);

        if (existing === undefined) {
          return [
            ...current,
            { participantId, stream: record.remoteStream, connectionState },
          ];
        }

        if (
          existing.stream === record.remoteStream &&
          existing.connectionState === connectionState
        ) {
          return current;
        }

        return current.map((peer) =>
          peer.participantId === participantId
            ? { participantId, stream: record.remoteStream, connectionState }
            : peer,
        );
      });
    },
    [],
  );

  /**
   * Retire the "unable to establish an audio connection" notice once it is no
   * longer true.
   *
   * A failed ICE transport is often recoverable: the agent can pick a new
   * candidate pair and the peer connection can reach `connected` again, and a
   * participant that could not be reached may simply have left. Without this,
   * one transient failure latches the notice for the rest of the meeting even
   * though audio is flowing, which reports a fixed problem as a live one.
   *
   * Only the connection notice is cleared, and only while no peer is still
   * failed, so a join, microphone, or socket error is never swallowed.
   */
  const clearStaleConnectionError = useCallback((): void => {
    const peerStates = [...peersRef.current.values()].map((peer) =>
      connectionStateFor(peer.connection),
    );

    setError((current) =>
      shouldRetireConnectionNotice(current, peerStates) ? null : current,
    );
  }, []);

  const createPeer = useCallback(
    (participantId: string): PeerRecord => {
      const existing = peersRef.current.get(participantId);

      if (existing !== undefined) {
        return existing;
      }

      const connection = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        bundlePolicy: "max-bundle",
      });
      const record: PeerRecord = {
        connection,
        remoteStream: null,
        pendingCandidates: [],
      };

      for (const track of streamRef.current.getTracks()) {
        if (track.readyState === "live") {
          connection.addTrack(track, streamRef.current);
        } else {
          setError(NO_LIVE_MICROPHONE_MESSAGE);
        }
      }

      connection.addEventListener("icecandidate", (event) => {
        const candidate = event.candidate;

        if (candidate === null || socketRef.current === null) {
          return;
        }

        const init = candidate.toJSON();
        socketRef.current.emit("webrtc:ice-candidate", {
          targetParticipantId: participantId,
          candidate: init.candidate ?? "",
          sdpMid: init.sdpMid ?? null,
          sdpMLineIndex: init.sdpMLineIndex ?? null,
          usernameFragment: init.usernameFragment ?? null,
        });
      });

      connection.addEventListener("track", (event) => {
        const eventStream = event.streams[0];

        if (eventStream !== undefined) {
          record.remoteStream = eventStream;
        } else {
          record.remoteStream ??= new MediaStream();

          if (!record.remoteStream.getTracks().some((track) => track.id === event.track.id)) {
            record.remoteStream.addTrack(event.track);
          }
        }

        syncRemotePeer(participantId, record);
      });

      connection.addEventListener("connectionstatechange", () => {
        syncRemotePeer(participantId, record);
        refreshStatus();
        const state = connection.connectionState;

        if (isFailedConnection(state)) {
          setError(CONNECTION_NOTICE_MESSAGE);
          return;
        }

        if (isRecoveredConnection(state)) {
          clearStaleConnectionError();
        }
      });

      peersRef.current.set(participantId, record);
      syncRemotePeer(participantId, record);
      refreshStatus();
      return record;
    },
    [clearStaleConnectionError, refreshStatus, syncRemotePeer],
  );

  const closePeer = useCallback(
    (participantId: string): void => {
      const record = peersRef.current.get(participantId);

      if (record !== undefined) {
        record.connection.close();
        peersRef.current.delete(participantId);
      }

      setRemotePeers((current) =>
        current.filter((peer) => peer.participantId !== participantId),
      );
      refreshStatus();
      // The participant we could not reach may have simply left; stop warning
      // about a connection failure once there is nothing left to fail.
      clearStaleConnectionError();
    },
    [clearStaleConnectionError, refreshStatus],
  );

  const closeAllPeers = useCallback((): void => {
    for (const record of peersRef.current.values()) {
      record.connection.close();
    }

    peersRef.current.clear();
    setRemotePeers([]);
  }, []);

  const flushPendingCandidates = useCallback(
    async (record: PeerRecord): Promise<void> => {
      const pending = record.pendingCandidates.splice(0);

      for (const candidate of pending) {
        try {
          await record.connection.addIceCandidate(candidate);
        } catch {
          setError(CONNECTION_NOTICE_MESSAGE);
        }
      }
    },
    [],
  );

  const sendOffer = useCallback(
    async (participantId: string): Promise<void> => {
      const socket = socketRef.current;

      if (socket === null) {
        return;
      }

      try {
        const record = createPeer(participantId);
        const offer = await record.connection.createOffer();
        await record.connection.setLocalDescription(offer);
        socket.emit("webrtc:offer", {
          targetParticipantId: participantId,
          sdp: offer.sdp ?? "",
        });
      } catch {
        setError(CONNECTION_NOTICE_MESSAGE);
      }
    },
    [createPeer],
  );

  const handleOffer = useCallback(
    async (payload: ForwardedOfferPayload): Promise<void> => {
      const socket = socketRef.current;

      if (socket === null) {
        return;
      }

      try {
        const record = createPeer(payload.participantId);
        await record.connection.setRemoteDescription({
          type: "offer",
          sdp: payload.sdp,
        });
        await flushPendingCandidates(record);
        const answer = await record.connection.createAnswer();
        await record.connection.setLocalDescription(answer);
        socket.emit("webrtc:answer", {
          targetParticipantId: payload.participantId,
          sdp: answer.sdp ?? "",
        });
      } catch {
        setError(CONNECTION_NOTICE_MESSAGE);
      }
    },
    [createPeer, flushPendingCandidates],
  );

  const handleAnswer = useCallback(
    async (payload: ForwardedAnswerPayload): Promise<void> => {
      const record = peersRef.current.get(payload.participantId);

      if (record === undefined) {
        return;
      }

      try {
        await record.connection.setRemoteDescription({
          type: "answer",
          sdp: payload.sdp,
        });
        await flushPendingCandidates(record);
        refreshStatus();
      } catch {
        setError(CONNECTION_NOTICE_MESSAGE);
      }
    },
    [flushPendingCandidates, refreshStatus],
  );

  const handleIceCandidate = useCallback(
    async (payload: ForwardedIceCandidatePayload): Promise<void> => {
      const record = createPeer(payload.participantId);
      const candidate: RTCIceCandidateInit = {
        candidate: payload.candidate,
        sdpMid: payload.sdpMid,
        sdpMLineIndex: payload.sdpMLineIndex,
        usernameFragment: payload.usernameFragment,
      };

      if (record.connection.remoteDescription === null) {
        record.pendingCandidates.push(candidate);
        return;
      }

      try {
        await record.connection.addIceCandidate(candidate);
      } catch {
        setError(CONNECTION_NOTICE_MESSAGE);
      }
    },
    [createPeer],
  );

  const handleMeetingJoined = useCallback(
    (payload: MeetingJoinedPayload): void => {
      const previousParticipantId = selfRef.current?.participantId;
      selfRef.current = payload.self;

      if (previousParticipantId !== payload.self.participantId) {
        closeAllPeers();
      }

      joinedRef.current = true;
      setSelf(payload.self);
      setParticipants(payload.participants);
      setError(null);
      setStatus("connected");

      const muted = streamRef.current.getAudioTracks()[0]?.enabled === false;
      setIsMuted(muted);
      socketRef.current?.emit("participant:state", { muted });

      for (const participant of payload.participants) {
        void sendOffer(participant.participantId);
      }

      refreshStatus();
    },
    [closeAllPeers, refreshStatus, sendOffer],
  );

  const leave = useCallback((): void => {
    if (leavingRef.current) {
      return;
    }

    leavingRef.current = true;
    joinedRef.current = false;
    startTokenRef.current += 1;
    startingRef.current = false;

    if (joinTimerRef.current !== null) {
      window.clearTimeout(joinTimerRef.current);
      joinTimerRef.current = null;
    }

    socketRef.current?.emit("meeting:leave");
    socketRef.current?.disconnect();
    socketRef.current = null;
    closeAllPeers();
    selfRef.current = null;
    setSelf(null);
    setParticipants([]);
    setIsMuted(false);
    setStatus("left");
  }, [closeAllPeers]);

  useEffect(() => {
    leaveRef.current = leave;
  }, [leave]);

  const start = useCallback(async (): Promise<void> => {
    if (startingRef.current || socketRef.current !== null) {
      return;
    }

    startingRef.current = true;
    leavingRef.current = false;
    startTokenRef.current += 1;
    const startToken = startTokenRef.current;
    setStatus("connecting");
    setError(null);

    const iceConfiguration = await resolveIceConfiguration(meetingCode);

    if (startToken !== startTokenRef.current) {
      return;
    }

    iceServersRef.current = iceConfiguration.iceServers;
    setIceWarning(buildIceWarning(iceConfiguration));

    if (SOCKET_URL === null) {
      setStatus("failed");
      setError(SERVICE_NOT_CONFIGURED_MESSAGE);
      startingRef.current = false;
      return;
    }

    const socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10_000,
    }) as MeetingSocket;
    socketRef.current = socket;

    const emitJoin = (): void => {
      if (joinTimerRef.current !== null) {
        window.clearTimeout(joinTimerRef.current);
      }

      setStatus(joinedRef.current ? "reconnecting" : "connecting");
      joinTimerRef.current = window.setTimeout(() => {
        if (!joinedRef.current) {
          setStatus("reconnecting");
          setError("Unable to connect to the meeting. Retrying…");
        }
      }, JOIN_TIMEOUT_MS);

      socket.emit("meeting:join", { meetingCode, displayName }, (result) => {
        if (joinTimerRef.current !== null) {
          window.clearTimeout(joinTimerRef.current);
          joinTimerRef.current = null;
        }

        if (!result.ok) {
          setStatus("failed");
          setError(joinErrorMessage(result.error.code));
        }
      });
    };

    socket.on("connect", emitJoin);
    socket.on("connect_error", () => {
      if (!leavingRef.current) {
        setStatus(joinedRef.current ? "reconnecting" : "connecting");
        setError("Unable to connect to the meeting server. Retrying…");
      }
    });
    socket.on("disconnect", () => {
      if (leavingRef.current) {
        return;
      }

      joinedRef.current = false;
      selfRef.current = null;
      setSelf(null);
      setParticipants([]);
      closeAllPeers();
      setStatus("reconnecting");
      setError("The connection was interrupted. Reconnecting…");
    });
    socket.on("meeting:joined", handleMeetingJoined);
    socket.on("participant:joined", (participant) => {
      if (participant.participantId === selfRef.current?.participantId) {
        return;
      }

      setParticipants((current) =>
        current.some(
          (existing) =>
            existing.participantId === participant.participantId,
        )
          ? current
          : [...current, participant],
      );
    });
    socket.on("participant:left", (payload: ParticipantLeftPayload) => {
      closePeer(payload.participantId);
      setParticipants((current) =>
        current.filter(
          (participant) =>
            participant.participantId !== payload.participantId,
        ),
      );
    });
    socket.on("participant:state", (payload: ParticipantStateEvent) => {
      setParticipants((current) =>
        current.map((participant) =>
          participant.participantId === payload.participantId
            ? { ...participant, muted: payload.muted }
            : participant,
        ),
      );
    });
    socket.on("webrtc:offer", (payload) => {
      void handleOffer(payload);
    });
    socket.on("webrtc:answer", (payload) => {
      void handleAnswer(payload);
    });
    socket.on("webrtc:ice-candidate", (payload) => {
      void handleIceCandidate(payload);
    });

    socket.connect();
    startingRef.current = false;
  }, [
    closeAllPeers,
    closePeer,
    displayName,
    handleAnswer,
    handleIceCandidate,
    handleMeetingJoined,
    handleOffer,
    meetingCode,
  ]);

  const toggleMute = useCallback((): void => {
    const track = streamRef.current.getAudioTracks()[0];

    if (track === undefined) {
      return;
    }

    track.enabled = !track.enabled;
    const muted = !track.enabled;
    setIsMuted(muted);
    socketRef.current?.emit("participant:state", { muted });
  }, []);

  const unlockAudio = useCallback((): void => {
    setAudioPlaybackVersion((version) => version + 1);
  }, []);

  const reportAudioBlocked = useCallback((): void => {
    setAudioBlocked(true);
  }, []);

  const reportAudioPlaying = useCallback((): void => {
    setAudioBlocked(false);
  }, []);

  useEffect(() => {
    const handleOnline = (): void => {
      const socket = socketRef.current;

      if (socket !== null && !socket.connected && !leavingRef.current) {
        socket.connect();
      }
    };

    const handlePageHide = (event: PageTransitionEvent): void => {
      if (!event.persisted) {
        leaveRef.current();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  useEffect(() => {
    return () => {
      leaveRef.current();
    };
  }, []);

  return {
    status,
    error,
    iceWarning,
    self,
    participants,
    remotePeers,
    isMuted,
    audioBlocked,
    audioPlaybackVersion,
    start,
    leave,
    toggleMute,
    unlockAudio,
    reportAudioBlocked,
    reportAudioPlaying,
  };
}
