import { randomBytes } from "node:crypto";
import {
  isMeetingCode,
  MEETING_CODE_LENGTH,
} from "../validation/meeting-code.js";

export function generateMeetingCode(): string {
  const meetingCode = randomBytes(9).toString("base64url");

  if (!isMeetingCode(meetingCode) || meetingCode.length !== MEETING_CODE_LENGTH) {
    throw new Error("Failed to generate a valid meeting code");
  }

  return meetingCode;
}
