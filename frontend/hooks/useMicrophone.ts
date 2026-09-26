"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MicrophoneStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "denied"
  | "unsupported"
  | "unavailable"
  | "disconnected"
  | "error";

export interface MicrophoneController {
  stream: MediaStream | null;
  status: MicrophoneStatus;
  error: string | null;
  isMuted: boolean;
  isSupported: boolean;
  start: () => Promise<MediaStream | null>;
  stop: () => void;
  toggleMuted: () => boolean;
}

function mediaErrorMessage(error: unknown): string {
  if (!(error instanceof DOMException)) {
    return "Unable to access your microphone. Please try again.";
  }

  switch (error.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Microphone permission was denied. Allow microphone access in your browser settings and try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No microphone was found. Connect a microphone and try again.";
    case "NotReadableError":
    case "TrackStartError":
      return "Your microphone is already in use by another application.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "Your microphone could not satisfy the requested settings.";
    case "SecurityError":
      return "Microphone access requires a secure connection. Use HTTPS and try again.";
    case "AbortError":
      return "The microphone request was interrupted. Please try again.";
    default:
      return "Unable to access your microphone. Please try again.";
  }
}

function mediaErrorStatus(error: unknown): MicrophoneStatus {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "denied";
    }

    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "unavailable";
    }
  }

  return "error";
}

export function useMicrophone(): MicrophoneController {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<MicrophoneStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<Promise<MediaStream | null> | null>(null);
  const stoppingRef = useRef(false);
  const trackCleanupRef = useRef<(() => void) | null>(null);

  const isSupported =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  const releaseStream = useCallback(() => {
    stoppingRef.current = true;
    trackCleanupRef.current?.();
    trackCleanupRef.current = null;
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
    setStream(null);
    setIsMuted(false);
    setStatus("idle");
  }, []);

  const start = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current !== null) {
      return streamRef.current;
    }

    if (requestRef.current !== null) {
      return requestRef.current;
    }

    if (
      typeof navigator === "undefined" ||
      typeof navigator.mediaDevices?.getUserMedia !== "function"
    ) {
      setStatus("unsupported");
      setError("This browser does not support microphone access.");
      return null;
    }

    setStatus("requesting");
    setError(null);

    const request = navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      .then((nextStream: MediaStream) => {
        const track = nextStream.getAudioTracks()[0];

        if (track === undefined) {
          nextStream.getTracks().forEach((mediaTrack) => {
            mediaTrack.stop();
          });
          setStatus("unavailable");
          setError("No microphone track was available.");
          return null;
        }

        stoppingRef.current = false;
        streamRef.current = nextStream;
        setStream(nextStream);
        setIsMuted(false);
        setStatus("ready");
        setError(null);

        const handleMuteEvent = (): void => {
          if (!stoppingRef.current && streamRef.current !== null) {
            setStatus("disconnected");
            setError("Your microphone stopped sending audio. Reconnect it and try again.");
          }
        };

        const handleUnmuteEvent = (): void => {
          if (!stoppingRef.current && streamRef.current !== null) {
            setStatus("ready");
            setError(null);
          }
        };

        const handleEndedEvent = (): void => {
          if (!stoppingRef.current && streamRef.current !== null) {
            setStatus("disconnected");
            setError("Your microphone was disconnected.");
          }
        };

        track.addEventListener("mute", handleMuteEvent);
        track.addEventListener("unmute", handleUnmuteEvent);
        track.addEventListener("ended", handleEndedEvent);
        trackCleanupRef.current = () => {
          track.removeEventListener("mute", handleMuteEvent);
          track.removeEventListener("unmute", handleUnmuteEvent);
          track.removeEventListener("ended", handleEndedEvent);
        };

        return nextStream;
      })
      .catch((error: unknown) => {
        setStatus(mediaErrorStatus(error));
        setError(mediaErrorMessage(error));
        return null;
      })
      .finally(() => {
        requestRef.current = null;
      });

    requestRef.current = request;
    return request;
  }, []);

  const toggleMuted = useCallback((): boolean => {
    const track = streamRef.current?.getAudioTracks()[0];

    if (track === undefined) {
      return false;
    }

    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
    return !track.enabled;
  }, []);

  useEffect(() => {
    return () => {
      stoppingRef.current = true;
      trackCleanupRef.current?.();
      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    };
  }, []);

  return {
    stream,
    status,
    error,
    isMuted,
    isSupported,
    start,
    stop: releaseStream,
    toggleMuted,
  };
}
