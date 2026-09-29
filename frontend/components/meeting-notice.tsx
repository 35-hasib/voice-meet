"use client";

import { AlertTriangle, Headphones, Volume2 } from "lucide-react";

/**
 * Notice strip shown above the participant stage.
 *
 * Sits in normal flow and shrinks the stage rather than overlaying it. A
 * floating strip covered the top of the first row of avatars, which is worst
 * exactly when the room is crowded enough to need a notice, and a banner in the
 * flow was previously rejected on the belief that it would push the control bar
 * off-screen. It does not: the stage is a `min-h-0` flex child, so it absorbs
 * the difference and the pinned control bar stays put.
 *
 * Only the highest priority notice is ever shown so the strip can never grow
 * tall enough to swallow the stage; the rest are reachable from the meeting menu.
 */
export function MeetingNotice({
  tone,
  message,
  action,
}: {
  tone: "error" | "warning" | "audio";
  message: string;
  action?: { label: string; onClick: () => void };
}): React.JSX.Element {
  const toneClasses = {
    error: "border-rose-400/30 bg-rose-500/15 text-rose-50",
    warning: "border-amber-300/30 bg-amber-400/15 text-amber-50",
    audio: "border-amber-200/30 bg-amber-200/15 text-amber-50",
  } as const;

  const Icon = tone === "audio" ? Headphones : AlertTriangle;

  return (
    <div className="flex shrink-0 justify-center">
      <div
        role={tone === "error" ? "alert" : "status"}
        data-testid="meeting-notice"
        data-tone={tone}
        className={`flex w-full max-w-xl items-center gap-2 rounded-2xl border px-3 py-2 shadow-lg shadow-black/30 backdrop-blur-md ${toneClasses[tone]}`}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {/*
         * Two lines rather than `truncate`. These messages are the ones a user
         * has to act on, and the no-TURN warning is 131 characters: truncated to
         * a single line it lost the sentence explaining what to do, and the
         * `title` fallback that was meant to compensate is invisible on touch,
         * which is where this app is mostly used. `min-w-0` still stops a long
         * backend error from widening the strip.
         */}
        <p className="min-w-0 flex-1 text-xs leading-5" title={message}>
          <span className="line-clamp-2">{message}</span>
        </p>
        {action !== undefined ? (
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl bg-white/90 px-2.5 text-xs font-semibold text-slate-950 transition hover:bg-white"
          >
            <Volume2 aria-hidden="true" className="size-3.5" />
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
