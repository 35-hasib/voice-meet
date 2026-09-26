"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import { getMeeting } from "@/lib/meeting-api";
import type { Meeting } from "@/types/meeting";

export type MeetingLookupStatus =
  | "loading"
  | "ready"
  | "not-found"
  | "closed"
  | "error";

export interface MeetingLookupState {
  status: MeetingLookupStatus;
  meeting: Meeting | null;
  error: string | null;
}

interface InternalLookupState extends MeetingLookupState {
  meetingCode: string | null;
}

export function useMeetingLookup(
  meetingCode: string | null,
): MeetingLookupState & {
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<InternalLookupState>({
    meetingCode,
    status: "loading",
    meeting: null,
    error: null,
  });

  const retry = useCallback(() => {
    setState({
      meetingCode,
      status: "loading",
      meeting: null,
      error: null,
    });
    setAttempt((value) => value + 1);
  }, [meetingCode]);

  useEffect(() => {
    if (meetingCode === null) {
      return;
    }

    let active = true;

    void getMeeting(meetingCode)
      .then((meeting) => {
        if (active) {
          setState({
            meetingCode,
            status: "ready",
            meeting,
            error: null,
          });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 404) {
          setState({
            meetingCode,
            status: "not-found",
            meeting: null,
            error: "Sorry, this meeting doesn't exist.",
          });
          return;
        }

        if (error instanceof ApiClientError && error.status === 410) {
          setState({
            meetingCode,
            status: "closed",
            meeting: null,
            error: "This meeting has been closed.",
          });
          return;
        }

        setState({
          meetingCode,
          status: "error",
          meeting: null,
          error:
            error instanceof Error
              ? error.message
              : "Unable to connect to the server.",
        });
      });

    return () => {
      active = false;
    };
  }, [attempt, meetingCode]);

  if (meetingCode === null) {
    return {
      status: "not-found",
      meeting: null,
      error: "Sorry, this meeting doesn't exist.",
      retry,
    };
  }

  if (state.meetingCode !== meetingCode) {
    return { status: "loading", meeting: null, error: null, retry };
  }

  return {
    status: state.status,
    meeting: state.meeting,
    error: state.error,
    retry,
  };
}
