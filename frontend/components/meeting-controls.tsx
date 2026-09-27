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
 * touch target. Labels live in `aria-label` and in a styled tooltip instead, so the
 * bar stays reachable by screen reader and by hover on desktop.
 *
 * The mic button is the one control whose state must be obvious at a glance, so
 * it inverts to a filled rose fill when muted rather than relying on the icon swap
 * alone.
 */
const controlButton =
  "grid size-11 shrink-0 place-items-center rounded-full border text-white transition duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 sm:size-12";

/**
 * Every tone owns its own background, hover background, and focus ring.
 *
 * These deliberately do not share a background utility with the base button
 * class. Two background-colour utilities on one element are not resolved by
 * class order: whichever rule Tailwind emits last in its stylesheet wins, so a
 * base `bg-white/[0.07]` would silently override the danger tone's `bg-red-600`
 * and the leave control would render grey.
 */
const toneClass = {
  neutral:
    "border-white/10 bg-white/[0.07] hover:bg-white/15 focus-visible:outline-cyan-200",
  rose: "border-rose-400/40 bg-rose-500 text-white hover:bg-rose-400 focus-visible:outline-rose-200",
  amber: "border-amber-300/40 bg-amber-400/90 text-slate-950 hover:bg-amber-300 focus-visible:outline-amber-200",
  danger:
    "border-red-500 bg-red-600 text-white hover:bg-red-500 focus-visible:outline-red-200",
} as const;

/**
 * One icon control plus its tooltip.
 *
 * The bar is icon-only because five labelled buttons cannot fit at a 44px touch
 * target on a 320px screen, so the name lives in `aria-label` and in a tooltip
 * that appears on hover and on keyboard focus. A native `title` tooltip is not
 * enough on its own: it cannot be styled, it appears after a delay, and touch
 * devices never show it at all.
 */
function ControlButton({
  label,
  hint,
  onClick,
  tone = "neutral",
  pressed,
  children,
}: {
  /** Accessible name, so the control still works with a screen reader. */
  label: string;
  /** Short visible text for the hover and focus tooltip. */
  hint: string;
  onClick: () => void;
  tone?: keyof typeof toneClass;
  pressed?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <span className="group relative shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
        className={`${controlButton} ${toneClass[tone]}`}
      >
        {children}
      </button>
      <span
        role="tooltip"
        data-testid="control-tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-slate-800/95 px-2 py-1 text-[0.6875rem] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {hint}
      </span>
    </span>
  );
}

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
        <ControlButton
          label={isMuted ? "Unmute microphone" : "Mute microphone"}
          hint={isMuted ? "Unmute mic" : "Mute mic"}
          onClick={onToggleMute}
          tone={isMuted ? "rose" : "neutral"}
          pressed={isMuted}
        >
          {isMuted ? (
            <MicOff aria-hidden="true" className="size-5 sm:size-[1.375rem]" />
          ) : (
            <Mic aria-hidden="true" className="size-5 sm:size-[1.375rem]" />
          )}
        </ControlButton>

        <ControlButton
          label={participantLabel}
          hint="People"
          onClick={onOpenParticipants}
        >
          <Users aria-hidden="true" className="size-5 sm:size-[1.375rem]" />
        </ControlButton>

        <ControlButton
          label={isOutputMuted ? "Unmute speakers" : "Mute speakers"}
          hint={isOutputMuted ? "Unmute sound" : "Mute sound"}
          onClick={onToggleOutput}
          tone={isOutputMuted ? "amber" : "neutral"}
          pressed={isOutputMuted}
        >
          {isOutputMuted ? (
            <VolumeX aria-hidden="true" className="size-5 sm:size-[1.375rem]" />
          ) : (
            <Volume2 aria-hidden="true" className="size-5 sm:size-[1.375rem]" />
          )}
        </ControlButton>

        <ControlButton label="Open meeting menu" hint="More" onClick={onOpenMore}>
          <EllipsisVertical
            aria-hidden="true"
            className="size-5 sm:size-[1.375rem]"
          />
        </ControlButton>

        <ControlButton
          label="Leave meeting"
          hint="Leave"
          onClick={onLeave}
          tone="danger"
        >
          <PhoneOff aria-hidden="true" className="size-5 sm:size-[1.375rem]" />
        </ControlButton>
      </div>
    </div>
  );
}
