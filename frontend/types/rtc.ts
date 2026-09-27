export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServerResponse {
  iceServers: IceServer[];
}

/**
 * Mirrors `RTCPeerConnection.connectionState`.
 *
 * `completed` is included because the peer connection reports it once ICE
 * gathering finishes for a connection that is already connected. Omitting it
 * made the type disagree with the platform: `useAudioMeeting` casts
 * `connection.connectionState` to this type, so a real browser could hand back
 * a state the type claimed was impossible.
 */
export type RtcConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "completed"
  | "disconnected"
  | "failed"
  | "closed";
