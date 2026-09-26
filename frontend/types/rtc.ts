export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServerResponse {
  iceServers: IceServer[];
}

export type RtcConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";
