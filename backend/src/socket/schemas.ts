import { z } from "zod";
import { meetingCodeSchema } from "../validation/meeting-code.js";

export const MAX_SDP_BYTES = 48 * 1024;
export const MAX_ICE_CANDIDATE_BYTES = 8 * 1024;
export const MAX_DISPLAY_NAME_CHARACTERS = 40;

function boundedString(maxBytes: number, minimumLength = 0) {
  return z
    .string()
    .min(minimumLength)
    .refine((value) => Buffer.byteLength(value, "utf8") <= maxBytes);
}

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

function displayNameLength(displayName: string): number {
  return [...graphemeSegmenter.segment(displayName)].length;
}

const participantIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{22}$/, "Invalid participant ID");

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required")
  .refine(
    (displayName) => displayNameLength(displayName) <= MAX_DISPLAY_NAME_CHARACTERS,
    `Display name must be at most ${MAX_DISPLAY_NAME_CHARACTERS.toString()} characters`,
  );

const targetSchema = z.object({
  targetParticipantId: participantIdSchema,
});

export const meetingJoinSchema = z
  .object({
    meetingCode: meetingCodeSchema,
    displayName: displayNameSchema,
  })
  .strict();

export const offerSchema = z
  .object({
    targetParticipantId: participantIdSchema,
    sdp: boundedString(MAX_SDP_BYTES, 1),
  })
  .strict();

export const answerSchema = offerSchema;

export const iceCandidateSchema = z
  .object({
    ...targetSchema.shape,
    candidate: boundedString(MAX_ICE_CANDIDATE_BYTES),
    sdpMid: z.string().max(128).nullable().optional(),
    sdpMLineIndex: z.number().int().nonnegative().max(65_535).nullable().optional(),
    usernameFragment: z.string().max(256).nullable().optional(),
  })
  .strict();

export const participantStateSchema = z
  .object({
    muted: z.boolean(),
  })
  .strict();
