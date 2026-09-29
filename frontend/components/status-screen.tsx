import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import {
  Headphones,
  RotateCcw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

/**
 * The single status screen used by every dead end in the app.
 *
 * There were five near-identical "icon, heading, body, action" cards before this
 * existed: the lobby's lookup and waiting states, the 404, and the route error
 * boundary. They had drifted apart in padding, corner radius, and structure,
 * which is exactly how a status screen ends up looking unowned. One component
 * means a fix to any of them applies to all of them.
 *
 * `app-shell` keeps it inside the fixed-viewport contract, so a status screen can
 * never introduce page scrolling the meeting screens are built to avoid.
 */
export function StatusScreen({
  title,
  message,
  eyebrow,
  icon: Icon = TriangleAlert,
  tone = "error",
  primaryAction,
  secondaryAction,
  busy = false,
}: {
  title: string;
  message: string;
  /** Small uppercase label above the title, e.g. a status code. */
  eyebrow?: string;
  icon?: LucideIcon;
  tone?: "error" | "warning" | "info";
  /** The main way out. Rendered as a link when `href` is given. */
  primaryAction?: { label: string; onClick?: () => void; href?: string };
  /** Usually a retry, shown beside the primary action. */
  secondaryAction?: { label: string; onClick: () => void };
  busy?: boolean;
}): React.JSX.Element {
  const iconTone = {
    error: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    warning: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    info: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200",
  } as const;

  return (
    <main className="app-shell safe-gutter bg-slate-950">
      <div className="app-shell-body flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-center shadow-2xl shadow-black/40 sm:p-7">
          <div className="mx-auto mb-5 w-fit">
            <BrandMark />
          </div>

          <div
            className={`mx-auto grid size-11 place-items-center rounded-2xl border ${iconTone[tone]}`}
          >
            <Icon aria-hidden="true" className="size-5" />
          </div>

          {eyebrow !== undefined ? (
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              {eyebrow}
            </p>
          ) : null}

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">{message}</p>

          {/*
            Actions are pinned below the message rather than at the bottom of the
            card. On a short viewport the card scrolls internally, and burying the
            only way out below the fold is how a dead end becomes a dead end.
          */}
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            {primaryAction !== undefined ? (
              primaryAction.href !== undefined ? (
                <Link
                  href={primaryAction.href}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
                >
                  {primaryAction.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={primaryAction.onClick}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
                >
                  {primaryAction.label}
                </button>
              )
            ) : null}

            {secondaryAction !== undefined ? (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                {secondaryAction.label}
              </button>
            ) : null}
          </div>

          {busy ? (
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Headphones aria-hidden="true" className="size-3.5" />
              Still working
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
