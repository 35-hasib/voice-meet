"use client";

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
 *
 * `cqi` rather than `dvh` for the type so the initials follow the card they sit
 * in. Viewport units ignore the user's font-size preference, so a user who has
 * raised their default text size got unchanged initials; a container unit scales
 * with the card and keeps the `rem` floor doing the accessibility work.
 */
const avatarSize: Record<ParticipantDensity, string> = {
  comfortable: "size-[min(30cqi,60%)] text-[clamp(1.125rem,13cqi,3rem)]",
  compact: "size-[min(28cqi,55%)] text-[clamp(0.9375rem,10cqi,2rem)]",
  dense: "size-[min(26cqi,50%)] text-[clamp(0.8125rem,8cqi,1.375rem)]",
};

const nameSize: Record<ParticipantDensity, string> = {
  comfortable: "text-base sm:text-lg",
  compact: "text-sm",
  dense: "text-xs",
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
 *
 * The card is a container query root so the avatar can be sized in `cqi`.
 */
const sizeClass = {
  hero: "mx-auto aspect-square max-h-full w-full max-w-[26rem] self-center lg:max-w-[34rem]",
  portrait: "aspect-[3/4] max-h-full self-center",
  square: "aspect-square max-h-full self-center",
  fill: "h-full",
} as const;

export function ParticipantCard({
  name,
  muted,
  isSelf,
  speaking,
  promoted = false,
  connectionState,
  density = "comfortable",
  size = "fill",
}: {
  name: string;
  muted: boolean;
  isSelf: boolean;
  /**
   * Speaking state, decided by the room rather than by the card.
   *
   * The card used to measure its own audio, which made "who is speaking" a
   * question no single component could answer. Levels are now compared across
   * every stream by the room, so the card is told the answer.
   */
  speaking: boolean;
  /**
   * The loudest speaker in the room, when the layout can express it.
   *
   * In a voice-only call "who is talking" is the most important thing on screen,
   * and a subtle border change on one card out of twelve is easy to miss. The
   * promoted card gets a ring and a caption instead.
   */
  promoted?: boolean;
  connectionState?: RtcConnectionState;
  density?: ParticipantDensity;
  size?: "hero" | "portrait" | "square" | "fill";
}): React.JSX.Element {
  const networkLabel = isSelf ? null : connectionLabel(connectionState);

  return (
    <article
      data-testid="participant-card"
      data-self={isSelf}
      data-speaking={speaking}
      data-promoted={promoted}
      className={`@container relative flex min-h-0 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border p-2 text-center transition-[border-color,background-color,box-shadow] duration-200 sm:gap-1.5 sm:rounded-3xl sm:p-3 ${sizeClass[size]} ${
        promoted
          ? "border-cyan-300/70 bg-cyan-300/[0.13] shadow-[0_0_48px_-14px_rgba(103,232,249,0.95)]"
          : speaking
            ? "border-cyan-300/55 bg-cyan-300/[0.09]"
            : "border-white/10 bg-white/[0.045]"
      } ${
        /*
         * The self marker has to survive every density. It used to be a caption
         * shown only at the comfortable size, so from five participants upward a
         * user could no longer tell which card was theirs — and mute acts on the
         * card you press, so that ambiguity has a cost.
         */
        isSelf
          ? "ring-1 ring-inset ring-white/20"
          : ""
      }`}
    >
      <div
        data-testid="participant-avatar"
        className={`relative grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold transition-[box-shadow,opacity,filter] duration-200 ${avatarSize[density]} ${toneFor(name)} ${
          speaking
            ? "shadow-[0_0_0_3px_rgba(103,232,249,0.28),0_0_0_6px_rgba(103,232,249,0.12)]"
            : "shadow-[0_0_0_1px_rgba(255,255,255,0.14)]"
        } ${muted ? "opacity-55 saturate-50" : ""}`}
      >
        {/*
          * `role="img"` gives the initials an accessible name. Without it the
          * avatar is a bare text node, so a screen reader announces the name twice
          * and the initials are not reliably announced at all.
        */}
        <span role="img" aria-label={`${name} avatar`}>
          {getInitials(name)}
        </span>

        {/*
          * Mute has to be readable at a glance on someone else's card, so it is
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
        {/*
         * Only the self state is captioned. "Participant" was rendered for
         * everyone else, which carried no information and competed with the two
         * captions that do matter.
         */}
        {isSelf ? (
          <p
            data-testid="participant-self-label"
            className="mt-0.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200"
          >
            You
          </p>
        ) : promoted ? (
          <p
            data-testid="participant-speaking-label"
            className="mt-0.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200"
          >
            Speaking
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
            <MicOff
              role="img"
              aria-label="Muted"
              className="size-3 sm:size-3.5"
            />
          ) : (
            <Mic role="img" aria-label="Microphone on" className="size-3 sm:size-3.5" />
          )}
        </span>
        {/*
          * The word, not just the icon. There is room for it at every density except
          * the crowded one, where the avatar badge carries the message instead.
         */}
        {muted && density !== "dense" ? (
          <span
            data-testid="participant-muted-label"
            className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-200"
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
                role="img"
                aria-label="Connecting"
                className="size-3 animate-spin sm:size-3.5"
              />
            ) : (
              <TriangleAlert
                role="img"
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
