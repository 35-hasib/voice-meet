"use client";

import { useEffect, useRef } from "react";

export function RemoteAudio({
  stream,
  playbackVersion,
  onBlocked,
  onPlaying,
  muted = false,
}: {
  stream: MediaStream;
  playbackVersion: number;
  onBlocked: () => void;
  onPlaying: () => void;
  /** Local playback mute only; the outgoing track and signalling are untouched. */
  muted?: boolean;
}): React.JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;

    if (audio === null) {
      return;
    }

    audio.srcObject = stream;
    void audio.play().then(onPlaying).catch(onBlocked);
  }, [onBlocked, onPlaying, playbackVersion, stream]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      muted={muted}
      aria-label="Remote meeting audio"
      className="hidden"
    />
  );
}
