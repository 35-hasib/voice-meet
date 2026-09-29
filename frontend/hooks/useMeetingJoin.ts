"use client";

import { useCallback, useState } from "react";
import { storeDisplayName } from "@/lib/display-name-storage";
import { normalizeDisplayName } from "@/lib/validation";
import type { MicrophoneController } from "./useMicrophone";

export interface MeetingJoinController {
  roomStream: MediaStream | null;
  roomName: string;
  isJoining: boolean;
  formError: string | null;
  join: (name: string) => Promise<void>;
  clearError: () => void;
  leaveRoom: () => void;
}

/**
 * Owns the lobby's side of joining: acquiring the microphone and handing the
 * stream to the room. Keeping this out of the lobby means the join is a single
 * stable callback, which is what lets the lobby trigger it straight from an
 * effect when a remembered name should skip the form.
 */
export function useMeetingJoin(
  microphone: MicrophoneController,
): MeetingJoinController {
  const [roomStream, setRoomStream] = useState<MediaStream | null>(null);
  const [roomName, setRoomName] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Depended on individually because the controller is a fresh object on every
  // render, which would make these callbacks unstable and re-trigger anything
  // that joins on them.
  const { start, stop, stream: currentStream } = microphone;

  const join = useCallback(
    async (name: string): Promise<void> => {
      const normalized = normalizeDisplayName(name);

      if (normalized.length === 0) {
        setFormError("Enter your display name before joining.");
        return;
      }

      setIsJoining(true);
      setFormError(null);

      let stream = currentStream;

      if (stream === null) {
        stream = await start();
      }

      // A refused, missing, or blocked microphone leaves the user in the lobby
      // with their name intact so they can retry or fix the browser setting.
      if (stream === null) {
        setIsJoining(false);
        return;
      }

      storeDisplayName(normalized);
      setRoomName(normalized);
      setRoomStream(stream);
      setIsJoining(false);
    },
    [currentStream, start],
  );

  const clearError = useCallback((): void => {
    setFormError(null);
  }, []);

  const leaveRoom = useCallback((): void => {
    setRoomStream(null);
    setRoomName("");
    stop();
  }, [stop]);

  return {
    roomStream,
    roomName,
    isJoining,
    formError,
    join,
    clearError,
    leaveRoom,
  };
}
