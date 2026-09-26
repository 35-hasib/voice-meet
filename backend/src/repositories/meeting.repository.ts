import type {
  CreateMeetingInput,
  MeetingRecord,
} from "../types/meeting.js";

export interface MeetingRepository {
  create(input: CreateMeetingInput): Promise<MeetingRecord>;
  findByCode(meetingCode: string): Promise<MeetingRecord | null>;
}
