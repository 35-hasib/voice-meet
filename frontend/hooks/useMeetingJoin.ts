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
  join: (name: string) => Promise<boolean>;
  clearError: () => void;
  /**
   * Shows a message on the join form from outside the join attempt itself.
   *
   * The room's socket join is the only place the server can report a full room,
   * so the rejection has to travel back out to the form. Setting it here, rather
   * than in separate lobby state, keeps a single error surface: the user never
   * sees two competing messages in the same screen.
   */
  showError: (message: string) => void;
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
    async (name: string): Promise<boolean> => {
      const normalized = normalizeDisplayName(name);

      if (normalized.length === 0) {
        setFormError("Enter your display name before joining.");
        return false;
      }

      setIsJoining(true);
      setFormError(null);

      let stream = currentStream;

      if (stream === null) {
        stream = await start();
      }

      // A refused, missing, or blocked microphone leaves the user in the lobby
      // with their name intact so they can retry or fix the browser setting.
      // Reporting the failure matters for the automatic join, which uses it to
      // decide between falling back to the form and waiting forever.
      if (stream === null) {
        setIsJoining(false);
        return false;
      }

      storeDisplayName(normalized);
      setRoomName(normalized);
      setRoomStream(stream);
      setIsJoining(false);
      return true;
    },
    [currentStream, start],
  );

  const clearError = useCallback((): void => {
    setFormError(null);
  }, []);

  const showError = useCallback((message: string): void => {
    setFormError(message);
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
    showError,
    leaveRoom,
  };
}
