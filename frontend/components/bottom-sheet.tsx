"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Modal bottom sheet sized for phones.
 *
 * Rendered inline rather than in a portal so it inherits the shell's stacking
 * context, which keeps it above the control bar without any z-index arithmetic.
 * Escape, a backdrop tap, and the close button all dismiss it, and focus moves
 * into the panel on open so keyboard and screen-reader users are not stranded
 * behind it.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();

    // The room must not scroll behind an open sheet.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-950/70 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="safe-bottom safe-x relative max-h-[80dvh] overflow-hidden rounded-t-3xl border-t border-white/10 bg-slate-900/95 shadow-2xl shadow-black/60 outline-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="contained-scroll max-h-[calc(80dvh-3.25rem)] px-4 py-3">
          {children}
        </div>
      </div>
    </div>
  );
}
