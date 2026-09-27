"use client";

import { useSpeakingIndicator } from "@/hooks/useSpeakingIndicator";
import { Mic, MicOff, TriangleAlert, LoaderCircle } from "lucide-react";
import { getInitials } from "@/lib/validation";
import type { ParticipantDensity } from "@/lib/participant-layout";
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

/**
 * Avatar sizing per density.
 *
 * The card fills whatever grid cell it is given rather than declaring its own
 * height, so the avatar has to shrink with the cell instead of overflowing it.
 * Comfortable gets a large stage; dense keeps the initials readable while fitting
 * four or more cards on a phone.
 *
 * The `min()` percentage is the important half: a `dvh` value alone looks right
 * on a tall stage but overflows a narrow card, because three participants on a
 * phone leave each card barely wider than the avatar would be. The card clips its
 * overflow, so without the width term the initials get cut off at the edges.
 */
const avatarSize: Record<ParticipantDensity, string> = {
  comfortable: "size-[min(26dvh,60%)] text-[clamp(1rem,5.5dvh,2.5rem)]",
  compact: "size-[min(15dvh,55%)] text-[clamp(0.875rem,4dvh,1.5rem)]",
  dense: "size-[min(11dvh,50%)] text-[clamp(0.75rem,3dvh,1.125rem)]",
};

const nameSize: Record<ParticipantDensity, string> = {
  comfortable: "text-base sm:text-lg",
  compact: "text-sm",
  dense: "text-[0.6875rem]",
};

/**
 * Sizing is derived from the participant count rather than the density alone,
 * because a phone stage is far taller than it is wide. Letting every card fill
 * that stage turns two participants into 180x350 slivers, so the grid caps the
 * shape and centres the leftover space instead of stretching the cards into it.
 *
 * `hero`      one participant: large square tile, capped so it stays a tile.
 * `portrait`  two or three side by side: 3:4 uses the extra height gracefully.
 * `square`    grids with a second row: 1:1 reads better than a stretched cell.
 * `fill`      scrollable grids only, where the viewport dictates the row height.
 */
const sizeClass = {
  hero: "mx-auto aspect-square max-h-full w-full max-w-[26rem] self-center",
  portrait: "aspect-[3/4] max-h-full self-center",
  square: "aspect-square max-h-full self-center",
  fill: "h-full",
} as const;

export function ParticipantCard({
  name,
  muted,
  isSelf,
  stream,
  connectionState,
  density = "comfortable",
  size = "fill",
}: {
  name: string;
  muted: boolean;
  isSelf: boolean;
  stream: MediaStream | null;
  connectionState?: RtcConnectionState;
  density?: ParticipantDensity;
  /**
   * Bounds the card so a stage that is much taller than it is wide cannot turn
   * every participant into a tall sliver. `fill` is only used once the grid has
   * to scroll, where the row height is dictated by the viewport instead.
   */
  size?: "hero" | "portrait" | "square" | "fill";
}): React.JSX.Element {
  const isSpeaking = useSpeakingIndicator(stream, !muted && stream !== null);
  const networkLabel = isSelf ? null : connectionLabel(connectionState);

  return (
    <article
      data-testid="participant-card"
      className={`relative flex min-h-0 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border p-2 text-center transition-[border-color,background-color,box-shadow] duration-200 sm:gap-1.5 sm:rounded-3xl sm:p-3 ${sizeClass[size]} ${
        isSpeaking
          ? "border-cyan-300/55 bg-cyan-300/[0.09] shadow-[0_0_36px_-16px_rgba(103,232,249,0.85)]"
          : "border-white/10 bg-white/[0.045]"
      }`}
    >
      <div
        data-testid="participant-avatar"
        className={`relative grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold transition-[box-shadow,opacity,filter] duration-200 ${avatarSize[density]} ${toneFor(name)} ${
          isSpeaking
            ? "shadow-[0_0_0_3px_rgba(103,232,249,0.28),0_0_0_6px_rgba(103,232,249,0.12)]"
            : "shadow-[0_0_0_1px_rgba(255,255,255,0.14)]"
        } ${muted ? "opacity-55 saturate-50" : ""}`}
      >
        {getInitials(name)}

        {/*
         * Mute needs to be readable at a glance on someone else's card, so it is
         * repeated on the avatar itself. A small badge under the name is easy to
         * miss, which made a working mute look like it had not been applied. This
         * copy is decorative: the labelled badge below carries the accessible name.
         */}
        {muted ? (
          <span
            aria-hidden="true"
            data-testid="participant-muted-badge"
            className="absolute -bottom-0.5 -right-0.5 grid size-[1.375rem] place-items-center rounded-full border-2 border-slate-950 bg-rose-500 text-white sm:size-6"
          >
            <MicOff className="size-2.5 sm:size-3" />
          </span>
        ) : null}
      </div>

      {/*
       * min-w-0 lets the name truncate instead of widening the card, and
       * truncate keeps a long name from wrapping and pushing the card taller than
       * its grid row.
       */}
      <div className="relative flex w-full min-w-0 flex-col items-center">
        <p
          className={`w-full truncate font-semibold text-white ${nameSize[density]}`}
          title={name}
        >
          {name}
        </p>
        {density === "comfortable" ? (
          <p className="mt-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-slate-400">
            {isSelf ? "You" : "Participant"}
          </p>
        ) : null}
      </div>

      {/* Icon-only mic state: the card gets too small for text badges. */}
      <div className="relative flex shrink-0 items-center gap-1.5">
        <span
          className={`grid place-items-center rounded-full border p-1 ${
            density === "dense" ? "size-5" : "size-6 sm:size-7"
          } ${
            muted
              ? "border-rose-300/25 bg-rose-300/10 text-rose-200"
              : "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
          }`}
          title={muted ? "Muted" : "Microphone on"}
        >
          {muted ? (
            <MicOff aria-label="Muted" className="size-3 sm:size-3.5" />
          ) : (
            <Mic aria-label="Microphone on" className="size-3 sm:size-3.5" />
          )}
        </span>
        {/*
         * The word, not just the icon. There is room for it at every density except
         * the crowded one, where the avatar badge carries the message instead.
         */}
        {muted && density !== "dense" ? (
          <span
            data-testid="participant-muted-label"
            className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-rose-200"
          >
            Muted
          </span>
        ) : null}
        {networkLabel !== null ? (
          <span
            className={`grid place-items-center rounded-full border border-amber-300/25 bg-amber-300/10 p-1 text-amber-100 ${
              density === "dense" ? "size-5" : "size-6 sm:size-7"
            }`}
            title={networkLabel}
          >
            {networkLabel === "Connecting" ? (
              <LoaderCircle
                aria-label="Connecting"
                className="size-3 animate-spin sm:size-3.5"
              />
            ) : (
              <TriangleAlert
                aria-label={networkLabel}
                className="size-3 sm:size-3.5"
              />
            )}
          </span>
        ) : null}
      </div>
    </article>
  );
}
