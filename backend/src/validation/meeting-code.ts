import { z } from "zod";

export const MEETING_CODE_LENGTH = 12;
export const MEETING_CODE_PATTERN = /^[A-Za-z0-9_-]{12}$/;

export const meetingCodeSchema = z
  .string()
  .regex(
    MEETING_CODE_PATTERN,
    `Meeting code must be ${MEETING_CODE_LENGTH.toString()} base64url characters`,
  );

export function isMeetingCode(value: string): boolean {
  return MEETING_CODE_PATTERN.test(value);
}
