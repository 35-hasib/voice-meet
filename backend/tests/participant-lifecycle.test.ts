import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { MeetingService } from "../src/services/meeting.service.js";
import { MeetingSocketService } from "../src/socket/meeting-socket.service.js";
import { createSocketServer } from "../src/socket/index.js";
import { ParticipantStore } from "../src/socket/participant-store.js";
import { FakeMeetingRepository } from "./support/fake-meeting.repository.js";

const MEETING_CODE = "AAAAAAAAAAAA";

const quietLogger = {
  info: vi.fn(),
  error: vi.fn(),
};

describe("participant leave persistence boundary", () => {
  it("removes transient state without deleting the permanent meeting", async () => {
    const repository = new FakeMeetingRepository();
    repository.seed(MEETING_CODE, "ACTIVE");
    const deleteMeeting = vi.fn();
    const repositoryBoundary = Object.assign(repository, {
      delete: deleteMeeting,
    });
    const meetingService = new MeetingService(
      repositoryBoundary,
      () => MEETING_CODE,
    );
    const participantIds = [
      "AAAAAAAAAAAAAAAAAAAAAA",
      "BBBBBBBBBBBBBBBBBBBBBB",
    ];
    let participantIndex = 0;
    const participants = new ParticipantStore(() => {
      const participantId = participantIds[participantIndex];
      participantIndex += 1;
      if (participantId === undefined) {
        throw new Error("Missing test participant ID");
      }
      return participantId;
    });
    const httpServer = createServer();
    const io = createSocketServer(httpServer, {
      meetingService,
      frontendUrls: ["http://localhost:3000"],
      logger: quietLogger,
    });
    const socketService = new MeetingSocketService(
      meetingService,
      participants,
      io,
      quietLogger,
    );
    const membership = participants.add("socket-1", MEETING_CODE, "Hasib");

    const removed = socketService.leaveParticipant("socket-1");

    expect(removed?.participantId).toBe(membership.participantId);
    expect(participants.getBySocketId("socket-1")).toBeNull();
    expect(participants.list(MEETING_CODE)).toEqual([]);
    expect(deleteMeeting).not.toHaveBeenCalled();
    expect(repository.getStoredMeeting(MEETING_CODE)).not.toBeNull();

    await io.close();
  });
});
