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
