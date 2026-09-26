import type { Request, Response } from "express";
import type { MeetingService } from "../services/meeting.service.js";
import type { AppLogger } from "../types/logger.js";
import type { MeetingResponse } from "../types/api.js";
import type { MeetingRecord } from "../types/meeting.js";

function serializeMeeting(meeting: MeetingRecord): MeetingResponse {
  return {
    id: meeting.id,
    meetingCode: meeting.meetingCode,
    status: meeting.status,
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt.toISOString(),
    closedAt: meeting.closedAt?.toISOString() ?? null,
  };
}

export class MeetingController {
  public constructor(
    private readonly meetingService: MeetingService,
    private readonly logger: AppLogger,
  ) {}

  public readonly create = async (
    _request: Request,
    response: Response,
  ): Promise<void> => {
    const startedAt = process.hrtime.bigint();
    this.logger.info("POST /api/meetings: start");

    const meeting = await this.meetingService.createMeeting();

    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    this.logger.info(
      `POST /api/meetings: done in ${elapsedMs.toFixed(1)}ms code=${meeting.meetingCode}`,
    );

    response.status(201).json(serializeMeeting(meeting));
  };

  public readonly getByCode = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const startedAt = process.hrtime.bigint();

    const meeting = await this.meetingService.getActiveMeeting(
      request.params.meetingCode,
    );

    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    this.logger.info(
      `GET /api/meetings/:meetingCode: done in ${elapsedMs.toFixed(1)}ms`,
    );

    response.status(200).json(serializeMeeting(meeting));
  };
}
