"use client";

import { useEffect, useRef } from "react";

export function RemoteAudio({
  stream,
  playbackVersion,
  onBlocked,
  onPlaying,
}: {
  stream: MediaStream;
  playbackVersion: number;
  onBlocked: () => void;
  onPlaying: () => void;
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
      aria-label="Remote meeting audio"
      className="hidden"
    />
  );
}
