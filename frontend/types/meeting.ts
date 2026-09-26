export type MeetingStatus = "ACTIVE" | "CLOSED";

export interface Meeting {
  id: string;
  meetingCode: string;
  status: MeetingStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface Participant {
  participantId: string;
  displayName: string;
  muted: boolean;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiErrorBody {
  error: ApiError;
}
