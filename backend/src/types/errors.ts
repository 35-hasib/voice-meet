export class AppError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class MeetingCodeConflictError extends Error {
  public constructor() {
    super("Meeting code already exists");
    this.name = "MeetingCodeConflictError";
  }
}

/**
 * The room already holds as many connected participants as it will accept.
 *
 * Only reachable from the socket join path, but extends `AppError` because that
 * is what `socketError` inspects when building an acknowledgement: it reads
 * `code`/`message` off an `AppError` and collapses anything else into a generic
 * internal error, which would hide the distinction from the client.
 */
export class MeetingRoomFullError extends AppError {
  public constructor() {
    super(409, "MEETING_FULL", "This meeting is full");
    this.name = "MeetingRoomFullError";
  }
}
