import type { Request, Response } from "express";
import type { MeetingService } from "../services/meeting.service.js";
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
  public constructor(private readonly meetingService: MeetingService) {}

  public readonly create = async (
    _request: Request,
    response: Response,
  ): Promise<void> => {
    const meeting = await this.meetingService.createMeeting();
    response.status(201).json(serializeMeeting(meeting));
  };

  public readonly getByCode = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const meeting = await this.meetingService.getActiveMeeting(
      request.params.meetingCode,
    );
    response.status(200).json(serializeMeeting(meeting));
  };
}
