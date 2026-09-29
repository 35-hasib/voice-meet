import { describe, expect, it, vi } from "vitest";
import { MeetingService } from "../src/services/meeting.service.js";
import { MeetingSocketService } from "../src/socket/meeting-socket.service.js";
import {
  MAX_PARTICIPANTS_PER_MEETING,
  ParticipantStore,
} from "../src/socket/participant-store.js";
import { MeetingRoomFullError } from "../src/types/errors.js";
import { FakeMeetingRepository } from "./support/fake-meeting.repository.js";
import { createServer } from "node:http";
import { createSocketServer } from "../src/socket/index.js";

const MEETING_CODE = "AAAAAAAAAAAA";
const OTHER_MEETING_CODE = "BBBBBBBBBBBB";

const quietLogger = {
  info: vi.fn(),
  error: vi.fn(),
};

type AppSocket = Parameters<MeetingSocketService["register"]>[0];

/**
 * Minimal socket double: enough surface for `register`, with no network. The
 * `join` handler is what the capacity test drives, so the room state is tracked
 * by hand to assert that a rejected joiner does not linger in the room.
 */
function createFakeSocket(id: string) {
  const rooms = new Set<string>();
  const handlers = new Map<string, (payload: unknown, ack?: (result: never) => void) => void>();
  const emitted: { room: string | null; event: string }[] = [];

  const socket = {
    id,
    rooms,
    emitted,
    on(event: string, handler: (payload: unknown, ack?: (result: never) => void) => void) {
      handlers.set(event, handler);
    },
    join(room: string) {
      rooms.add(room);
      return Promise.resolve();
    },
    leave(room: string) {
      rooms.delete(room);
      return Promise.resolve();
    },
    to(room: string) {
      return {
        emit(event: string) {
          emitted.push({ room, event });
        },
      };
    },
    emit(event: string) {
      emitted.push({ room: null, event });
    },
  };

  return { socket, handlers, rooms, emitted };
}

function fillRoom(participants: ParticipantStore, count: number, code = MEETING_CODE): void {
  for (let index = 0; index < count; index += 1) {
    participants.add(`socket-${code}-${index.toString()}`, code, `P${index.toString()}`);
  }
}

describe("participant capacity", () => {
  it("rejects a join once the room is full", () => {
    const participants = new ParticipantStore();
    fillRoom(participants, MAX_PARTICIPANTS_PER_MEETING);

    expect(participants.list(MEETING_CODE)).toHaveLength(MAX_PARTICIPANTS_PER_MEETING);
    expect(() => participants.add("socket-overflow", MEETING_CODE, "Overflow")).toThrow(
      MeetingRoomFullError,
    );
    // The rejected join must not have been recorded anywhere.
    expect(participants.getBySocketId("socket-overflow")).toBeNull();
    expect(participants.list(MEETING_CODE)).toHaveLength(MAX_PARTICIPANTS_PER_MEETING);
  });

  it("frees a slot when a participant leaves", () => {
    const participants = new ParticipantStore();
    fillRoom(participants, MAX_PARTICIPANTS_PER_MEETING);
    const removed = participants.removeBySocketId(`socket-${MEETING_CODE}-0`);

    expect(removed).not.toBeNull();
    // Capacity is not cumulative: a seat that opens up is immediately usable.
    const rejoiner = participants.add("socket-rejoiner", MEETING_CODE, "Rejoiner");
    expect(rejoiner.participantId).toBeTruthy();
  });

  it("caps each meeting independently", () => {
    const participants = new ParticipantStore();
    fillRoom(participants, MAX_PARTICIPANTS_PER_MEETING, MEETING_CODE);

    // A different meeting must not be affected by a full room.
    const other = participants.add("socket-other", OTHER_MEETING_CODE, "Other");
    expect(other.participantId).toBeTruthy();
  });

  it("returns MEETING_FULL to a joining socket and does not strand it in the room", async () => {
    const repository = new FakeMeetingRepository();
    repository.seed(MEETING_CODE, "ACTIVE");
    const meetingService = new MeetingService(repository, () => MEETING_CODE);
    const participants = new ParticipantStore();
    fillRoom(participants, MAX_PARTICIPANTS_PER_MEETING);

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
    const { socket, handlers, rooms } = createFakeSocket("socket-newcomer");
    socketService.register(socket as unknown as AppSocket);

    const joinHandler = handlers.get("meeting:join");
    expect(joinHandler).toBeDefined();

    const ack = vi.fn();
    joinHandler?.({ meetingCode: MEETING_CODE, displayName: "Newcomer" }, ack);

    // The join handler is async internally, so let its microtasks settle.
    await vi.waitFor(() => {
      expect(ack).toHaveBeenCalled();
    });

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: { code: "MEETING_FULL", message: "This meeting is full" },
    });
    // The rejected socket must have been removed from the room it briefly joined.
    expect(rooms.has(`meeting:${MEETING_CODE}`)).toBe(false);
    expect(participants.getBySocketId("socket-newcomer")).toBeNull();

    await io.close();
  });
});
