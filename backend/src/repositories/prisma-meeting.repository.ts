import {
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import type {
  CreateMeetingInput,
  MeetingRecord,
} from "../types/meeting.js";
import { MeetingCodeConflictError } from "../types/errors.js";
import type { MeetingRepository } from "./meeting.repository.js";

function isMeetingCodeConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  const target: unknown = error.meta?.target;

  return (
    target === "meetingCode" ||
    (Array.isArray(target) && target.includes("meetingCode"))
  );
}

export class PrismaMeetingRepository implements MeetingRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async create(input: CreateMeetingInput): Promise<MeetingRecord> {
    try {
      return await this.prisma.meeting.create({ data: input });
    } catch (error: unknown) {
      if (isMeetingCodeConflict(error)) {
        throw new MeetingCodeConflictError();
      }

      throw error;
    }
  }

  public async findByCode(
    meetingCode: string,
  ): Promise<MeetingRecord | null> {
    return this.prisma.meeting.findUnique({ where: { meetingCode } });
  }
}
