import type { MeetingRepository } from "../../src/repositories/meeting.repository.js";
import { MeetingCodeConflictError } from "../../src/types/errors.js";
import type {
  CreateMeetingInput,
  MeetingRecord,
  MeetingStatus,
} from "../../src/types/meeting.js";

export class FakeMeetingRepository implements MeetingRepository {
  public readonly createInputs: CreateMeetingInput[] = [];
  private readonly meetings = new Map<string, MeetingRecord>();
  private nextMeetingNumber = 1;

  public constructor(private conflictsToInject = 0) {}

  public create(input: CreateMeetingInput): Promise<MeetingRecord> {
    this.createInputs.push(input);

    if (this.conflictsToInject > 0) {
      this.conflictsToInject -= 1;
      return Promise.reject(new MeetingCodeConflictError());
    }

    if (this.meetings.has(input.meetingCode)) {
      return Promise.reject(new MeetingCodeConflictError());
    }

    const now = new Date("2026-01-01T00:00:00.000Z");
    const meeting: MeetingRecord = {
      id: `meeting-${this.nextMeetingNumber.toString()}`,
      meetingCode: input.meetingCode,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };
    this.nextMeetingNumber += 1;
    this.meetings.set(meeting.meetingCode, meeting);
    return Promise.resolve(meeting);
  }

  public findByCode(meetingCode: string): Promise<MeetingRecord | null> {
    return Promise.resolve(this.meetings.get(meetingCode) ?? null);
  }

  public seed(meetingCode: string, status: MeetingStatus): MeetingRecord {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const meeting: MeetingRecord = {
      id: `seeded-${meetingCode}`,
      meetingCode,
      status,
      createdAt,
      updatedAt: createdAt,
      closedAt:
        status === "CLOSED" ? new Date("2026-01-02T00:00:00.000Z") : null,
    };
    this.meetings.set(meetingCode, meeting);
    return meeting;
  }

  public getStoredMeeting(meetingCode: string): MeetingRecord | null {
    return this.meetings.get(meetingCode) ?? null;
  }
}
