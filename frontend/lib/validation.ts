export const MEETING_CODE_LENGTH = 12;
export const MAX_DISPLAY_NAME_CHARACTERS = 40;

export const MEETING_CODE_PATTERN = new RegExp(
  `^[A-Za-z0-9_-]{${MEETING_CODE_LENGTH.toString()}}$`,
);

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const controlCharactersPattern = /[\u0000-\u001f\u007f-\u009f]/g;
const repeatedWhitespacePattern = /\s+/g;

function isMeetingCode(value: string): boolean {
  return MEETING_CODE_PATTERN.test(value);
}

function codeFromPath(value: string): string | null {
  const segments = value.split("/").filter(Boolean);
  const candidate = segments.at(-1);

  return candidate !== undefined && isMeetingCode(candidate) ? candidate : null;
}

export function extractMeetingCode(value: string): string | null {
  const trimmed = value.trim();

  if (isMeetingCode(trimmed)) {
    return trimmed;
  }

  if (trimmed.includes("/")) {
    try {
      const url = new URL(trimmed);
      return codeFromPath(url.pathname);
    } catch {
      return codeFromPath(trimmed);
    }
  }

  return null;
}

export function normalizeDisplayName(value: string): string {
  const cleaned = value
    .replace(controlCharactersPattern, " ")
    .replace(repeatedWhitespacePattern, " ")
    .trim();

  return [...graphemeSegmenter.segment(cleaned)]
    .slice(0, MAX_DISPLAY_NAME_CHARACTERS)
    .map((segment) => segment.segment)
    .join("");
}

export function isValidDisplayName(value: string): boolean {
  return normalizeDisplayName(value).length > 0;
}

export function getInitials(name: string): string {
  const parts = normalizeDisplayName(name).split(" ").filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return [...graphemeSegmenter.segment(parts[0] ?? "")]
      .slice(0, 2)
      .map((segment) => segment.segment)
      .join("")
      .toUpperCase();
  }

  const first = [...graphemeSegmenter.segment(parts[0] ?? "")][0]?.segment ?? "";
  const second = [...graphemeSegmenter.segment(parts[1] ?? "")][0]?.segment ?? "";
  return `${first}${second}`.toUpperCase();
}

export function buildMeetingLink(origin: string, meetingCode: string): string {
  return `${origin.replace(/\/+$/, "")}/meet/${meetingCode}`;
}
