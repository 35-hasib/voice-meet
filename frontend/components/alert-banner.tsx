import { AlertTriangle } from "lucide-react";

export function AlertBanner({
  children,
  tone = "error",
}: {
  children: React.ReactNode;
  tone?: "error" | "warning" | "info";
}): React.JSX.Element {
  const toneClasses = {
    error: "border-rose-400/25 bg-rose-400/10 text-rose-100",
    warning: "border-amber-300/25 bg-amber-300/10 text-amber-50",
    info: "border-cyan-300/25 bg-cyan-300/10 text-cyan-50",
  } as const;

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 ${toneClasses[tone]}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <AlertTriangle aria-hidden="true" className="mt-1 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
