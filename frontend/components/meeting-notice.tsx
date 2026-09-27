"use client";

import { AlertTriangle, Headphones, Volume2 } from "lucide-react";

/**
 * Floating notice strip.
 *
 * Deliberately overlays the participant stage rather than sitting in the layout
 * flow. A banner in normal flow would push the control bar past the viewport,
 * which is exactly the overflow this screen is built to avoid. Only the highest
 * priority notice is ever shown so the strip can never grow tall enough to cover
 * the stage; the rest are reachable from the meeting menu.
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
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-3 pt-2">
      <div
        role={tone === "error" ? "alert" : "status"}
        data-testid="meeting-notice"
        data-tone={tone}
        className={`pointer-events-auto flex w-full max-w-xl items-center gap-2 rounded-2xl border px-3 py-2 shadow-lg shadow-black/30 backdrop-blur-md ${toneClasses[tone]}`}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {/*
         * truncate with min-w-0 keeps a long backend error from widening the
         * strip and causing horizontal overflow; the full text stays in `title`.
         */}
        <p className="min-w-0 flex-1 truncate text-xs" title={message}>
          {message}
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
