"use client";

import {
  Mic,
  MicOff,
  PhoneOff,
  Users,
  Volume2,
  VolumeX,
  EllipsisVertical,
} from "lucide-react";

/**
 * Pinned control bar.
 *
 * Icon-only by design: at 320px wide, five labelled buttons cannot fit at a 44px
 * touch target. Labels live in `aria-label` and `title` instead, so the bar stays
 * reachable by screen reader and by hover on desktop.
 *
 * The mic button is the one control whose state must be obvious at a glance, so
 * it inverts to a filled rose fill when muted rather than relying on the icon swap
 * alone.
 */
const controlButton =
  "grid size-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.07] text-white transition duration-150 hover:bg-white/15 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 sm:size-12";

export function MeetingControls({
  isMuted,
  isOutputMuted,
  participantCount,
  onToggleMute,
  onToggleOutput,
  onOpenParticipants,
  onOpenMore,
  onLeave,
}: {
  isMuted: boolean;
  isOutputMuted: boolean;
  participantCount: number;
  onToggleMute: () => void;
  onToggleOutput: () => void;
  onOpenParticipants: () => void;
  onOpenMore: () => void;
  onLeave: () => void;
}): React.JSX.Element {
  const participantLabel =
    participantCount === 1
      ? "Show participants, 1 person here"
      : `Show participants, ${participantCount.toString()} people here`;

  return (
    <div
      data-testid="control-bar"
      className="safe-x safe-bottom border-t border-white/8 bg-slate-950/85 pt-2 backdrop-blur-xl"
    >
      <div className="flex items-center justify-center gap-1.5 px-2 pt-1 sm:gap-2.5 sm:px-4">
        <button
          type="button"
          onClick={onToggleMute}
          aria-pressed={isMuted}
          aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
          title={isMuted ? "Unmute microphone" : "Mute microphone"}
          className={`${controlButton} ${
            isMuted
              ? "border-rose-400/40 bg-rose-500 text-white hover:bg-rose-400"
              : ""
          }`}
        >
          {isMuted ? (
            <MicOff aria-hidden="true" className="size-5 sm:size-[1.375rem]" />
          ) : (
            <Mic aria-hidden="true" className="size-5 sm:size-[1.375rem]" />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenParticipants}
          aria-label={participantLabel}
          title="Participants"
          className={controlButton}
        >
          <Users aria-hidden="true" className="size-5 sm:size-[1.375rem]" />
        </button>

        <button
          type="button"
          onClick={onToggleOutput}
          aria-pressed={isOutputMuted}
          aria-label={isOutputMuted ? "Unmute speakers" : "Mute speakers"}
          title={isOutputMuted ? "Unmute speakers" : "Mute speakers"}
          className={`${controlButton} ${
            isOutputMuted
              ? "border-amber-300/40 bg-amber-400/90 text-slate-950 hover:bg-amber-300"
              : ""
          }`}
        >
          {isOutputMuted ? (
            <VolumeX aria-hidden="true" className="size-5 sm:size-[1.375rem]" />
          ) : (
            <Volume2 aria-hidden="true" className="size-5 sm:size-[1.375rem]" />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenMore}
          aria-label="Open meeting menu"
          title="More"
          className={controlButton}
        >
          <EllipsisVertical
            aria-hidden="true"
            className="size-5 sm:size-[1.375rem]"
          />
        </button>

        <button
          type="button"
          onClick={onLeave}
          aria-label="Leave meeting"
          title="Leave meeting"
          className={`${controlButton} border-rose-500 bg-rose-500 text-white hover:bg-rose-400 focus-visible:outline-rose-200`}
        >
          <PhoneOff aria-hidden="true" className="size-5 sm:size-[1.375rem]" />
        </button>
      </div>
    </div>
  );
}
