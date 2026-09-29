import { describe, expect, it } from "vitest";
import {
  allowsInternalScrolling,
  centresParticipantGrid,
  LAYOUT_BREAKPOINT_WIDTHS,
  layoutBreakpointForWidth,
  MAX_CARDS_WITHOUT_SCROLL,
  participantCardSize,
  participantColumns,
  participantDensity,
  participantGridClass,
  participantRowCount,
} from "../lib/participant-layout.js";

describe("layoutBreakpointForWidth", () => {
  it("treats anything below the first screen as base", () => {
    expect(layoutBreakpointForWidth(0)).toBe("base");
    expect(layoutBreakpointForWidth(375)).toBe("base");
    expect(layoutBreakpointForWidth(639)).toBe("base");
  });

  it("switches at exactly the widths Tailwind uses", () => {
    // Off by one here means the JS geometry and the CSS grid disagree by one
    // viewport, which is the whole failure this function exists to prevent.
    expect(layoutBreakpointForWidth(640)).toBe("sm");
    expect(layoutBreakpointForWidth(1023)).toBe("sm");
    expect(layoutBreakpointForWidth(1024)).toBe("lg");
    expect(layoutBreakpointForWidth(2560)).toBe("lg");
  });

  it("resolves the widest matching screen first, not the first match", () => {
    // The list is ordered widest-first precisely so a desktop cannot be reported
    // as `sm` just because `sm` appears earlier in the array.
    const widths = [...LAYOUT_BREAKPOINT_WIDTHS].map(({ minWidth }) => minWidth);
    expect(widths).toEqual([...widths].sort((a, b) => b - a));

    for (const { minWidth, name } of LAYOUT_BREAKPOINT_WIDTHS) {
      expect(layoutBreakpointForWidth(minWidth)).toBe(name);
    }
  });
});

describe("participantColumns", () => {
  it("gives a solo participant the whole stage", () => {
    expect(participantColumns(1)).toBe(1);
  });

  it("puts two participants side by side", () => {
    expect(participantColumns(2)).toBe(2);
  });

  it("keeps two columns for a small group so cards stay readable", () => {
    expect(participantColumns(3)).toBe(2);
    expect(participantColumns(4)).toBe(2);
  });

  it("adds columns only once the room is genuinely crowded", () => {
    expect(participantColumns(5)).toBe(3);
    expect(participantColumns(8)).toBe(3);
    expect(participantColumns(9)).toBe(4);
    expect(participantColumns(20)).toBe(4);
  });

  it("allows more columns once there is horizontal room", () => {
    expect(participantColumns(4, "base")).toBe(2);
    expect(participantColumns(4, "sm")).toBe(3);
    expect(participantColumns(10, "base")).toBe(4);
    expect(participantColumns(10, "lg")).toBe(5);
  });

  it("never returns fewer than one column for degenerate counts", () => {
    expect(participantColumns(0)).toBe(1);
    expect(participantColumns(-4)).toBe(1);
    expect(participantColumns(2.7)).toBe(2);
  });
});

describe("participantGridClass", () => {
  it("emits a single class when every breakpoint agrees", () => {
    expect(participantGridClass(1)).toBe("grid-cols-1");
    expect(participantGridClass(2)).toBe("grid-cols-2");
  });

  it("emits an sm override when the base and sm counts differ", () => {
    expect(participantGridClass(4)).toBe("grid-cols-2 sm:grid-cols-3");
  });

  it("emits an lg override without repeating an identical sm count", () => {
    const classes = participantGridClass(10).split(" ");

    expect(classes[0]).toBe("grid-cols-4");
    // sm resolves to the same four columns, so no sm class is needed.
    expect(classes).not.toContain("sm:grid-cols-4");
    expect(classes).toContain("lg:grid-cols-5");
  });
});

describe("participantRowCount and participantDensity", () => {
  it("keeps a single participant on one comfortable row", () => {
    expect(participantRowCount(1)).toBe(1);
    expect(participantDensity(1)).toBe("comfortable");
  });

  it("keeps two side-by-side participants on a single comfortable row", () => {
    expect(participantRowCount(2)).toBe(1);
    expect(participantDensity(2)).toBe("comfortable");
  });

  it("treats two rows as compact and three or more as dense", () => {
    expect(participantRowCount(4)).toBe(2);
    expect(participantDensity(4)).toBe("compact");

    expect(participantRowCount(8)).toBe(3);
    expect(participantDensity(8)).toBe("dense");
    expect(participantRowCount(9)).toBe(3);
    expect(participantDensity(9)).toBe("dense");
  });

  it("resolves rows against the active breakpoint, not the phone one", () => {
    // Four participants is two columns on a phone (two rows) but three on a
    // tablet and three on a desktop, so the same room reported a different shape
    // depending on screen size. Resolving at the active breakpoint is what stops
    // a desktop grid from being laid out with phone-density chrome.
    expect(participantRowCount(4, "base")).toBe(2);
    expect(participantRowCount(4, "sm")).toBe(2);
    expect(participantRowCount(4, "lg")).toBe(2);

    // Six participants: three columns everywhere, so two rows at every width.
    expect(participantRowCount(6, "base")).toBe(2);
    expect(participantRowCount(6, "lg")).toBe(2);

    // Two participants stay on one row at every breakpoint.
    expect(participantRowCount(2, "base")).toBe(1);
    expect(participantRowCount(2, "lg")).toBe(1);
  });

  it("lets density improve as the grid gains columns", () => {
    // Ten participants: four columns on a phone (three rows, dense) but six on a
    // desktop (two rows, compact), so the wider screen gets genuinely less
    // cluttered cards rather than the same dense treatment in more space.
    expect(participantDensity(10, "base")).toBe("dense");
    expect(participantDensity(10, "lg")).toBe("compact");

    expect(participantDensity(2, "base")).toBe("comfortable");
    expect(participantDensity(2, "lg")).toBe("comfortable");
  });
});

describe("allowsInternalScrolling", () => {
  it("keeps ordinary rooms free of any scrolling", () => {
    for (let count = 1; count <= MAX_CARDS_WITHOUT_SCROLL; count += 1) {
      expect(allowsInternalScrolling(count)).toBe(false);
    }
  });

  it("only scrolls the list itself for unusually large rooms", () => {
    expect(allowsInternalScrolling(MAX_CARDS_WITHOUT_SCROLL + 1)).toBe(true);
    expect(allowsInternalScrolling(0)).toBe(false);
  });
});

describe("participantCardSize", () => {
  it("gives a lone participant one large square tile", () => {
    expect(participantCardSize(1)).toBe("hero");
  });

  it("keeps a single row of two readable at 3:4", () => {
    // Two cards are the only phone layout that stays on one row, and a tall stage
    // would otherwise stretch them into slivers.
    expect(participantCardSize(2)).toBe("portrait");
  });

  it("squares off everything that wraps to a second row on a phone", () => {
    // Three participants is two columns on a phone, so the size follows the base
    // breakpoint even though a desktop grid would fit them on one row.
    expect(participantCardSize(3)).toBe("square");
    expect(participantCardSize(4)).toBe("square");
    expect(participantCardSize(6)).toBe("square");
  });

  it("hands the row height back to the viewport only when the list scrolls", () => {
    expect(participantCardSize(7)).toBe("fill");
    expect(participantCardSize(30)).toBe("fill");
  });

  it("treats a malformed count as a single participant", () => {
    expect(participantCardSize(0)).toBe("hero");
    expect(participantCardSize(-3)).toBe("hero");
  });

  it("widens a single row to portrait only where the grid really is one row", () => {
    // Two participants are one row at every breakpoint, so the shape is stable.
    expect(participantCardSize(2, "base")).toBe("portrait");
    expect(participantCardSize(2, "lg")).toBe("portrait");

    // Four participants stay two rows everywhere, so they remain square; the
    // breakpoint must not quietly promote them to a tall, sliver-prone shape.
    expect(participantCardSize(4, "base")).toBe("square");
    expect(participantCardSize(4, "lg")).toBe("square");
  });

  it("keeps the scrolling list filling the viewport at every breakpoint", () => {
    // A card aspect ratio would fight the viewport-decided row height here.
    expect(participantCardSize(7, "base")).toBe("fill");
    expect(participantCardSize(7, "lg")).toBe("fill");
  });
});

describe("centresParticipantGrid", () => {
  it("centres rows while the cards are height-capped", () => {
    expect(centresParticipantGrid(1)).toBe(true);
    expect(centresParticipantGrid(6)).toBe(true);
  });

  it("never centres a scrolling list, whose top edge would be unreachable", () => {
    expect(centresParticipantGrid(7)).toBe(false);
    expect(centresParticipantGrid(12)).toBe(false);
  });
});

describe("participantGridClass", () => {
  it("emits responsive variants as complete literals", () => {
    // Tailwind only compiles a responsive utility when the full class name appears
    // in scanned source. Concatenating the prefix at runtime yields a class that is
    // silently dropped, which left every desktop override inert.
    expect(participantGridClass(3)).toBe("grid-cols-2 lg:grid-cols-3");
    expect(participantGridClass(4)).toBe("grid-cols-2 sm:grid-cols-3");
    expect(participantGridClass(6)).toBe("grid-cols-3 lg:grid-cols-4");
    expect(participantGridClass(12)).toBe("grid-cols-4 lg:grid-cols-5");
    expect(participantGridClass(20)).toBe("grid-cols-4 sm:grid-cols-5 lg:grid-cols-6");
  });

  it("omits variants that would not change the column count", () => {
    // These counts resolve to the same column count at every breakpoint, so an
    // override would be a no-op rule.
    expect(participantGridClass(1)).toBe("grid-cols-1");
    expect(participantGridClass(2)).toBe("grid-cols-2");
    expect(participantGridClass(5)).toBe("grid-cols-3");
  });
});
