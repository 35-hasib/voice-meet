export const meetingStatuses = ["ACTIVE", "CLOSED"] as const;

export type MeetingStatus = (typeof meetingStatuses)[number];

export interface MeetingRecord {
  id: string;
  meetingCode: string;
  status: MeetingStatus;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

export interface CreateMeetingInput {
  meetingCode: string;
}
