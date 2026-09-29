"use client";

import { useSyncExternalStore } from "react";
import {
  LAYOUT_BREAKPOINT_WIDTHS,
  layoutBreakpointForWidth,
  type LayoutBreakpoint,
} from "@/lib/participant-layout";

/**
 * The active Tailwind breakpoint, so JavaScript geometry can agree with the
 * responsive classes the browser is already applying.
 *
 * The participant grid widens to four or five columns on a desktop, so anything
 * derived from the column count has to be derived from the *current* column
 * count, not the phone one. Reading that back from the DOM is the alternative and
 * it forces a layout read on every join and leave; a `matchMedia` subscription
 * answers the same question without touching layout.
 *
 * Subscribing rather than polling matters for the resize case: the e2e audit
 * resizes the window between viewports and immediately measures, so a
 * `resize`-throttled update would race the measurement.
 */
function subscribe(onChange: () => void): () => void {
  const queries = LAYOUT_BREAKPOINT_WIDTHS.map(({ minWidth }) =>
    window.matchMedia(`(min-width: ${minWidth.toString()}px)`),
  );

  const handleChange = (): void => {
    onChange();
  };

  for (const query of queries) {
    query.addEventListener("change", handleChange);
  }

  return () => {
    for (const query of queries) {
      query.removeEventListener("change", handleChange);
    }
  };
}

function getSnapshot(): LayoutBreakpoint {
  return layoutBreakpointForWidth(window.innerWidth);
}

/**
 * The server has no viewport, so it must report `base` for the first render.
 * A desktop client then corrects it before paint, which keeps the markup valid
 * and the hydration clean.
 */
function getServerSnapshot(): LayoutBreakpoint {
  return "base";
}

export function useLayoutBreakpoint(): LayoutBreakpoint {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
