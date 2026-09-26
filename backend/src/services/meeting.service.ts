import type { MeetingRepository } from "../repositories/meeting.repository.js";
import { AppError, MeetingCodeConflictError } from "../types/errors.js";
import type { MeetingRecord } from "../types/meeting.js";
import { meetingCodeSchema } from "../validation/meeting-code.js";
import { generateMeetingCode } from "./meeting-code.js";

const DEFAULT_CODE_ATTEMPTS = 5;

export class MeetingService {
  public constructor(
    private readonly repository: MeetingRepository,
    private readonly createMeetingCode: () => string = generateMeetingCode,
    private readonly maxCodeAttempts = DEFAULT_CODE_ATTEMPTS,
  ) {}

  public async createMeeting(): Promise<MeetingRecord> {
    for (let attempt = 0; attempt < this.maxCodeAttempts; attempt += 1) {
      const meetingCode = this.createMeetingCode();

      try {
        return await this.repository.create({ meetingCode });
      } catch (error: unknown) {
        if (!(error instanceof MeetingCodeConflictError)) {
          throw error;
        }

        if (attempt === this.maxCodeAttempts - 1) {
          break;
        }
      }
    }

    throw new AppError(
      503,
      "MEETING_CODE_UNAVAILABLE",
      "Unable to create a meeting right now",
    );
  }

  public async getActiveMeeting(
    meetingCode: unknown,
  ): Promise<MeetingRecord> {
    const parsedCode = meetingCodeSchema.safeParse(meetingCode);

    if (!parsedCode.success) {
      throw new AppError(
        400,
        "INVALID_MEETING_CODE",
        "Meeting code must be 12 base64url characters",
      );
    }

    const meeting = await this.repository.findByCode(parsedCode.data);

    if (meeting === null) {
      throw new AppError(404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    if (meeting.status === "CLOSED") {
      throw new AppError(410, "MEETING_CLOSED", "Meeting is closed");
    }

    return meeting;
  }
}
