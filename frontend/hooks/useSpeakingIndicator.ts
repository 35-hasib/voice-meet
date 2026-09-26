"use client";

import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 180;
const SPEAKING_THRESHOLD = 0.06;
const SILENT_THRESHOLD = 0.03;

type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

interface SpeakingState {
  streamKey: string | null;
  isSpeaking: boolean;
}

export function useSpeakingIndicator(
  stream: MediaStream | null,
  enabled = true,
): boolean {
  const streamKey = enabled && stream !== null ? stream.id : null;
  const [state, setState] = useState<SpeakingState>({
    streamKey: null,
    isSpeaking: false,
  });

  useEffect(() => {
    if (streamKey === null || stream === null) {
      return;
    }

    const audioWindow = window as AudioContextWindow;
    const AudioContextConstructor =
      audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

    if (AudioContextConstructor === undefined) {
      return;
    }

    const context = new AudioContextConstructor();
    let interval: number | null = null;

    try {
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);

      interval = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;

        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }

        const level = Math.sqrt(sum / samples.length);

        setState((current) => {
          const isNewStream = current.streamKey !== streamKey;
          const isSpeaking = isNewStream
            ? level >= SPEAKING_THRESHOLD
            : level >= (current.isSpeaking ? SILENT_THRESHOLD : SPEAKING_THRESHOLD);

          if (!isNewStream && current.isSpeaking === isSpeaking) {
            return current;
          }

          return { streamKey, isSpeaking };
        });
      }, POLL_INTERVAL_MS);
    } catch {
      interval = null;
    }

    return () => {
      if (interval !== null) {
        window.clearInterval(interval);
      }

      void context.close().catch(() => undefined);
    };
  }, [stream, streamKey]);

  return streamKey !== null && state.streamKey === streamKey && state.isSpeaking;
}
