import type { Request, Response } from "express";
import type { IceCredentialsService } from "../services/ice-credentials.service.js";
import type { IceServer } from "../types/api.js";

export class RtcCredentialsController {
  public constructor(
    private readonly credentialsService: IceCredentialsService,
  ) {}

  public readonly getCredentials = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const iceServers: IceServer[] =
      await this.credentialsService.getIceServers(request.query.meetingCode);
    response.status(200).json({ iceServers });
  };
}
