import type { MeetingStatus } from "./meeting.js";

export interface MeetingResponse {
  id: string;
  meetingCode: string;
  status: MeetingStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
