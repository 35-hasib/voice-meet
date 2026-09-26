import { describe, expect, it } from "vitest";
import { MeetingService } from "../src/services/meeting.service.js";
import { FakeMeetingRepository } from "./support/fake-meeting.repository.js";

const FIRST_CODE = "AAAAAAAAAAAA";
const SECOND_CODE = "BBBBBBBBBBBB";

describe("MeetingService", () => {
  it("retries meeting creation after a unique-code conflict", async () => {
    const repository = new FakeMeetingRepository(1);
    const codes = [FIRST_CODE, SECOND_CODE];
    let codeIndex = 0;
    const service = new MeetingService(repository, () => {
      const code = codes[codeIndex];
      codeIndex += 1;
      if (code === undefined) {
        throw new Error("Missing test code");
      }
      return code;
    });

    const meeting = await service.createMeeting();

    expect(meeting.meetingCode).toBe(SECOND_CODE);
    expect(repository.createInputs).toEqual([
      { meetingCode: FIRST_CODE },
      { meetingCode: SECOND_CODE },
    ]);
  });

  it("stops after the configured number of conflicts", async () => {
    const repository = new FakeMeetingRepository(5);
    const service = new MeetingService(
      repository,
      () => FIRST_CODE,
      5,
    );

    await expect(service.createMeeting()).rejects.toMatchObject({
      statusCode: 503,
      code: "MEETING_CODE_UNAVAILABLE",
    });
    expect(repository.createInputs).toHaveLength(5);
  });
});
