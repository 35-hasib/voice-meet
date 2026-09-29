import { LoaderCircle } from "lucide-react";

/**
 * Route-level loading state.
 *
 * Deliberately not a `StatusScreen`: that component is a full dead end with
 * heading, message, and an action to leave, none of which apply to a route that
 * is still resolving. What this needs is a spinner and a polite announcement —
 * the screen has to be marked as a live region or a screen-reader user meets
 * silence for as long as the network takes.
 */
export default function Loading(): React.JSX.Element {
  return (
    <main className="app-shell safe-gutter bg-slate-950">
      <div className="app-shell-body flex items-center justify-center">
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-4 text-slate-300"
        >
          <LoaderCircle aria-hidden="true" className="size-8 animate-spin text-cyan-300" />
          <p className="text-sm">Loading AudioMeet…</p>
        </div>
      </div>
    </main>
  );
}
