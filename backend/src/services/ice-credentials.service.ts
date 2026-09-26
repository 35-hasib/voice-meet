import { createHmac } from "node:crypto";
import type { MeetingService } from "./meeting.service.js";
import type { IceServer } from "../types/api.js";

export const TURN_CREDENTIAL_TTL_SECONDS = 300;

export interface TurnConfig {
  urls: string[];
  usernamePrefix: string;
  sharedSecret: string;
}

export class IceCredentialsService {
  public constructor(
    private readonly meetingService: MeetingService,
    private readonly turn: TurnConfig | null,
    private readonly stunUrls: string[],
    private readonly nowMilliseconds: () => number = Date.now,
  ) {}

  public async getIceServers(meetingCode: unknown): Promise<IceServer[]> {
    await this.meetingService.getActiveMeeting(meetingCode);
    const iceServers: IceServer[] = this.stunUrls.map((urls) => ({ urls }));

    if (this.turn === null) {
      return iceServers;
    }

    const expiresAt =
      Math.floor(this.nowMilliseconds() / 1000) +
      TURN_CREDENTIAL_TTL_SECONDS;
    const username = `${this.turn.usernamePrefix}:${expiresAt.toString()}`;
    const credential = createHmac("sha1", this.turn.sharedSecret)
      .update(username)
      .digest("base64");

    iceServers.push(
      ...this.turn.urls.map((urls) => ({
        urls,
        username,
        credential,
      })),
    );

    return iceServers;
  }
}
