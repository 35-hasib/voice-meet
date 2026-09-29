import { AlertTriangle, Info } from "lucide-react";

/**
 * Inline message on a form or in the lobby.
 *
 * The `info` tone existed but was never used and rendered the warning triangle
 * regardless, so any future use would have shown the wrong icon for its severity.
 * It is now wired to its own icon, or the tone is gone.
 */
export function AlertBanner({
  children,
  tone = "error",
}: {
  children: React.ReactNode;
  tone?: "error" | "warning";
}): React.JSX.Element {
  const toneClasses = {
    error: "border-rose-400/25 bg-rose-400/10 text-rose-100",
    warning: "border-amber-300/25 bg-amber-300/10 text-amber-50",
  } as const;

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 ${toneClasses[tone]}`}
      /*
       * An error interrupts, a warning waits its turn. Both are announced
       * politely because a join rejection is a consequence of something the user
       * just did, and interrupting mid-interaction is more disruptive than a
       * moment's delay.
       */
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "error" ? (
        <AlertTriangle aria-hidden="true" className="mt-1 size-4 shrink-0" />
      ) : (
        <Info aria-hidden="true" className="mt-1 size-4 shrink-0" />
      )}
      <div>{children}</div>
    </div>
  );
}
