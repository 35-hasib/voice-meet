"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/**
 * Selector for everything that can hold focus inside the panel.
 *
 * `[tabindex]:not([tabindex="-1"])` is deliberately not used: it would also match
 * a disabled or programmatically-focused element. This matches what a keyboard
 * user can actually reach.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Modal bottom sheet sized for phones.
 *
 * Rendered inline rather than in a portal so it inherits the shell's stacking
 * context, which keeps it above the control bar without any z-index arithmetic.
 * Escape, a backdrop tap, and the close button all dismiss it.
 *
 * Focus is fully managed: it moves into the panel on open, is trapped while the
 * panel is open, and returns to the control that opened it on close. Moving focus
 * in without trapping it let Tab walk straight out into the controls behind the
 * sheet, and never restoring it dropped the user back at the top of the document.
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
  const titleId = useId();
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const panel = panelRef.current;

      if (panel === null) {
        return;
      }

      const focusable = [
        ...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ].filter((element) => element.offsetParent !== null);

      // Nothing to cycle through: the panel itself keeps focus.
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();

    // The room must not scroll behind an open sheet.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Returning focus to the trigger is what keeps a keyboard user from being
      // dropped at the top of the document every time the sheet closes.
      previouslyFocusedRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      {/*
        A presentational backdrop rather than a button. As a button it sat first
        in the accessibility tree, so a screen-reader user met a second "Close
        menu" control with nothing between it and the panel; it is now a plain
        click target, and the panel has its own labelled close button.
      */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="safe-bottom safe-x relative max-h-[80dvh] overflow-hidden rounded-t-3xl border-t border-white/10 bg-slate-900/95 shadow-2xl shadow-black/60 outline-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
          {/*
            The title is referenced by `aria-labelledby` rather than duplicated
            through `aria-label`, so the accessible name and the visible heading
            cannot drift apart.
          */}
          <h2 id={titleId} className="text-sm font-semibold text-white">
            {title}
          </h2>
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
