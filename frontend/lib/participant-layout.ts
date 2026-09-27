/**
 * Grid geometry for the participant list.
 *
 * The room must never scroll, so the grid cannot simply stack cards and let the
 * page grow. The grid fills the space left between the header and the control bar,
 * and the card count decides how many columns are needed.
 *
 * Columns alone are not enough, because a phone stage is far taller than it is
 * wide. Letting each card fill its cell turns two participants into tall slivers,
 * so cards also cap their own height with an aspect ratio and the grid centres
 * the leftover space around them. Only a scrolling list hands its row height back
 * to the viewport. Nothing is measured in JavaScript: the browser resolves the
 * aspect ratio against the cell it is given.
 */

export type LayoutBreakpoint = "base" | "sm" | "lg";

/** Controls how much chrome a card shows, so a dense grid stays legible. */
export type ParticipantDensity = "comfortable" | "compact" | "dense";

/** Largest card count that maps to a given column count, per breakpoint. */
const COLUMN_STEPS: Record<
  LayoutBreakpoint,
  readonly { readonly upTo: number; readonly columns: number }[]
> = {
  // Phones: two columns already make cards narrow, so reserve the third and
  // fourth for genuinely crowded rooms.
  base: [
    { upTo: 1, columns: 1 },
    { upTo: 4, columns: 2 },
    { upTo: 8, columns: 3 },
    { upTo: Number.POSITIVE_INFINITY, columns: 4 },
  ],
  sm: [
    { upTo: 1, columns: 1 },
    { upTo: 3, columns: 2 },
    { upTo: 8, columns: 3 },
    { upTo: 15, columns: 4 },
    { upTo: Number.POSITIVE_INFINITY, columns: 5 },
  ],
  lg: [
    { upTo: 1, columns: 1 },
    { upTo: 2, columns: 2 },
    { upTo: 5, columns: 3 },
    { upTo: 9, columns: 4 },
    { upTo: 15, columns: 5 },
    { upTo: Number.POSITIVE_INFINITY, columns: 6 },
  ],
};

/**
 * Above this count a card can no longer stay legible, so the list switches to an
 * internal scroll panel. The page itself still never scrolls.
 */
export const MAX_CARDS_WITHOUT_SCROLL = 6;

/**
 * Tailwind discovers utilities by scanning source text for whole class names, so a
 * responsive variant only exists if its complete literal appears somewhere. These
 * maps therefore spell out the prefix instead of concatenating it at runtime:
 * building "lg:" + "grid-cols-3" yields a class the compiler never emits, and the
 * override fails silently rather than erroring. Only the column counts each
 * breakpoint can actually return are listed, to avoid generating dead rules.
 */
const COLUMN_CLASSES = {
  base: {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
  },
  sm: {
    1: "sm:grid-cols-1",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-4",
    5: "sm:grid-cols-5",
  },
  lg: {
    1: "lg:grid-cols-1",
    2: "lg:grid-cols-2",
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
    6: "lg:grid-cols-6",
  },
} as const satisfies Record<LayoutBreakpoint, Record<number, string>>;

function columnClass(columns: number, breakpoint: LayoutBreakpoint = "base"): string {
  const table = COLUMN_CLASSES[breakpoint] as Record<number, string>;
  return table[columns] ?? COLUMN_CLASSES.base[1];
}

/**
 * Columns for `count` cards at a breakpoint. Count is clamped to at least one so
 * an empty room renders a valid grid instead of a zero-column track.
 */
export function participantColumns(
  count: number,
  breakpoint: LayoutBreakpoint = "base",
): number {
  const total = Math.max(1, Math.floor(count));

  for (const step of COLUMN_STEPS[breakpoint]) {
    if (total <= step.upTo) {
      return step.columns;
    }
  }

  return 1;
}

/** Responsive column classes, so one element covers every breakpoint. */
export function participantGridClass(count: number): string {
  const base = participantColumns(count, "base");
  const sm = participantColumns(count, "sm");
  const lg = participantColumns(count, "lg");

  // Each override is only emitted when it actually changes the count, so the
  // class list stays free of no-op rules.
  const classes = [
    columnClass(base, "base"),
    sm !== base ? columnClass(sm, "sm") : "",
    lg !== sm ? columnClass(lg, "lg") : "",
  ].filter(Boolean);

  return classes.join(" ");
}

/** Rows implied by the base column count; used to scale the card chrome. */
export function participantRowCount(count: number): number {
  const total = Math.max(1, Math.floor(count));
  return Math.ceil(total / participantColumns(total, "base"));
}

export function participantDensity(count: number): ParticipantDensity {
  const rows = participantRowCount(count);

  if (rows <= 1) {
    return "comfortable";
  }

  return rows <= 2 ? "compact" : "dense";
}

/** Whether the list must scroll internally to stay inside the viewport. */
export function allowsInternalScrolling(count: number): boolean {
  return Math.max(0, Math.floor(count)) > MAX_CARDS_WITHOUT_SCROLL;
}

/** How a card should bound itself within its grid cell. */
export type ParticipantCardSize = "hero" | "portrait" | "square" | "fill";

/**
 * Card shape for a given count.
 *
 * `fill` is reserved for scrolling lists: the viewport decides the row height
 * there, and an aspect ratio would fight it. Everything else caps its height and
 * lets the grid centre the difference, so a lone participant gets one large
 * square tile and a row of three stays a readable 3:4 rather than a sliver.
 */
export function participantCardSize(count: number): ParticipantCardSize {
  const total = Math.max(1, Math.floor(count));

  if (allowsInternalScrolling(total)) {
    return "fill";
  }

  if (total === 1) {
    return "hero";
  }

  return participantRowCount(total) === 1 ? "portrait" : "square";
}

/**
 * Whether the grid should centre its rows instead of stretching them.
 *
 * Never true for a scrolling list. Centring a grid whose content overflows is
 * unreliable across browsers: the overflowing top edge becomes unreachable, which
 * would break the list precisely when it is long enough to need scrolling.
 */
export function centresParticipantGrid(count: number): boolean {
  return !allowsInternalScrolling(count);
}
