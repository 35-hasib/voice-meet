"use client";

import { useSpeakingIndicator } from "@/hooks/useSpeakingIndicator";
import { Mic, MicOff } from "lucide-react";
import { getInitials } from "@/lib/validation";
import type { RtcConnectionState } from "@/types/rtc";

const avatarTones = [
  "from-cyan-300 to-sky-500 text-slate-950",
  "from-violet-300 to-fuchsia-500 text-white",
  "from-amber-200 to-orange-500 text-slate-950",
  "from-emerald-200 to-teal-500 text-slate-950",
  "from-rose-200 to-pink-500 text-slate-950",
] as const;

function toneFor(name: string): (typeof avatarTones)[number] {
  const hash = [...name].reduce(
    (value, character) => (value * 31 + character.codePointAt(0)!) % 997,
    7,
  );
  return avatarTones[hash % avatarTones.length] ?? avatarTones[0];
}

function connectionLabel(
  state: RtcConnectionState | undefined,
): string | null {
  switch (state) {
    case "connecting":
      return "Connecting";
    case "disconnected":
      return "Reconnecting";
    case "failed":
      return "Connection failed";
    default:
      return null;
  }
}

export function ParticipantCard({
  name,
  muted,
  isSelf,
  stream,
  connectionState,
}: {
  name: string;
  muted: boolean;
  isSelf: boolean;
  stream: MediaStream | null;
  connectionState?: RtcConnectionState;
}): React.JSX.Element {
  const isSpeaking = useSpeakingIndicator(stream, !muted && stream !== null);
  const networkLabel = isSelf ? null : connectionLabel(connectionState);

  return (
    <article
      className={`relative flex min-h-64 flex-col items-center justify-center overflow-hidden rounded-[2rem] border p-6 text-center transition duration-300 ${
        isSpeaking
          ? "border-cyan-300/55 bg-cyan-300/[0.09] shadow-[0_0_44px_-18px_rgba(103,232,249,0.9)]"
          : "border-white/10 bg-white/[0.045]"
      }`}
    >
      <div
        aria-hidden="true"
        className="absolute -top-20 left-1/2 size-48 -translate-x-1/2 rounded-full bg-cyan-300/10 blur-3xl"
      />
      <div
        className={`relative grid size-28 place-items-center rounded-full bg-gradient-to-br text-3xl font-semibold shadow-2xl transition ${toneFor(name)} ${
          isSpeaking ? "ring-4 ring-cyan-200/60 ring-offset-4 ring-offset-slate-950" : "ring-1 ring-white/15"
        }`}
      >
        {getInitials(name)}
      </div>
      <div className="relative mt-6 flex w-full min-w-0 flex-col items-center gap-1">
        <p className="w-full truncate text-lg font-semibold text-white">{name}</p>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
          {isSelf ? "You" : "Participant"}
        </p>
      </div>
      <div className="relative mt-5 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
            muted
              ? "border-rose-300/20 bg-rose-300/10 text-rose-100"
              : "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
          }`}
        >
          {muted ? (
            <MicOff aria-hidden="true" className="size-3.5" />
          ) : (
            <Mic aria-hidden="true" className="size-3.5" />
          )}
          {muted ? "Muted" : "Mic on"}
        </span>
        {networkLabel !== null ? (
          <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100">
            {networkLabel}
          </span>
        ) : null}
      </div>
    </article>
  );
}
