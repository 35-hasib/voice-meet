let chromium;

try {
  ({ chromium } = await import("playwright"));
} catch {
  process.stderr.write(
    "playwright is not installed.\n\n" +
      "  npm install --no-save playwright\n" +
      "  npx playwright install chromium\n\n" +
      "Then start the backend and frontend dev servers and run:\n\n" +
      "  node scripts/browser-e2e.mjs\n",
  );
  process.exit(1);
}

const API = process.env.E2E_API_URL ?? "http://localhost:4000";
const WEB = process.env.E2E_WEB_URL ?? "http://localhost:3000";
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok) });
  process.stdout.write(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}\n`,
  );
}

const waitForRemoteAudio = (page) =>
  page
    .waitForFunction(
      () =>
        [...document.querySelectorAll("audio")].some(
          (element) => element.srcObject instanceof MediaStream,
        ),
      undefined,
      { timeout: 30000 },
    )
    .then(() => true)
    .catch(() => false);

const measureRemoteAudio = (page) =>
  page.evaluate(async () => {
    const audios = [...document.querySelectorAll("audio")].filter(
      (element) => element.srcObject instanceof MediaStream,
    );

    if (audios.length === 0) {
      return { remoteStreams: 0, tracks: 0, energy: 0, trackState: "none", muted: null };
    }

    const stream = audios[0].srcObject;
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    let peak = 0;

    for (let attempt = 0; attempt < 25; attempt += 1) {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      peak = Math.max(peak, Math.sqrt(sum / samples.length));

      if (peak > 0.01) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const tracks = stream.getAudioTracks();
    const report = {
      remoteStreams: audios.length,
      tracks: tracks.length,
      energy: Number(peak.toFixed(4)),
      trackState: tracks[0]?.readyState ?? "none",
      muted: tracks[0]?.muted ?? null,
    };

    await audioContext.close();
    return report;
  });

/**
 * Widths worth holding the layout to. 320 is the narrowest phone still sold, the
 * 360-412 range covers the common handsets, and 430/768/1024 sit on the
 * responsive breakpoints where the column count changes. A regression in the
 * breakpoint utilities is invisible at one width and obvious at the next.
 */
const VIEWPORTS = [
  { name: "320x568", width: 320, height: 568 },
  { name: "360x800", width: 360, height: 800 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "412x915", width: 412, height: 915 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
];

/**
 * Expected column count for the three-participant room audited below, restated
 * from lib/participant-layout.ts on purpose so the browser check is an
 * independent oracle rather than a restatement of the same helper. Two
 * participants fit per row on a phone, and the lg breakpoint widens the same
 * three participants to three columns.
 */
const expectedColumnsForThree = (width) => (width >= 1024 ? 3 : 2);

/**
 * Measures what the layout promises: the page never scrolls, nothing is
 * horizontally off-screen, the control bar stays fully visible with 44px touch
 * targets, and the participant cards sit between the header and the controls
 * rather than underneath them.
 */
const auditLayout = (page) =>
  page.evaluate(() => {
    const scroller = document.scrollingElement ?? document.documentElement;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const bar = document.querySelector('[data-testid="control-bar"]');
    const header = document.querySelector("header");
    const cards = [...document.querySelectorAll('[data-testid="participant-card"]')];
    const codeChip = document.querySelector('[data-testid="meeting-code-chip"]');
    const buttons = bar ? [...bar.querySelectorAll("button")] : [];

    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
    };

    const barBox = bar ? rect(bar) : null;
    const headerBox = header ? rect(header) : null;
    const cardBoxes = cards.map(rect);
    const buttonBoxes = buttons.map((button) => ({ ...rect(button), label: button.getAttribute("aria-label") }));

    // Resolved column count, rather than the class list: a responsive utility that
    // Tailwind never emitted leaves the class in place but changes nothing, so
    // only the computed track count reveals that the breakpoint did not apply.
    const grid = document.querySelector('[data-testid="participant-grid"]');
    const columnCount = grid
      ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length
      : 0;

    return {
      viewport,
      // A pixel of tolerance absorbs sub-pixel layout rounding.
      verticalOverflow: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
      horizontalOverflow: Math.max(0, scroller.scrollWidth - scroller.clientWidth),
      // Once the room is too crowded to fit, the list itself may scroll, but the
      // page still must not.
      listScrollsInternally: (() => {
        const grid = document.querySelector('[data-testid="participant-grid"]');
        return grid !== null && grid.scrollHeight > grid.clientHeight + 1;
      })(),
      barVisible:
        barBox !== null &&
        barBox.bottom <= viewport.height + 1 &&
        barBox.top >= 0 &&
        barBox.height > 0,
      barButtonCount: buttonBoxes.length,
      smallestTouchTarget: buttonBoxes.length
        ? Math.min(...buttonBoxes.map((box) => Math.min(box.width, box.height)))
        : 0,
      unlabelledButtons: buttonBoxes.filter((box) => !box.label).map((box) => box.label),
      headerHeight: headerBox === null ? null : Math.round(headerBox.height),
      codeChipVisible:
        codeChip !== null &&
        rect(codeChip).right <= viewport.width + 1 &&
        rect(codeChip).left >= -1,
      cardCount: cardBoxes.length,
      columnCount,
      // Cards must not be taller than the stage they were given.
      cardsWithinStage:
        cardBoxes.length > 0 &&
        barBox !== null &&
        cardBoxes.every(
          (box) =>
            box.bottom <= barBox.top + 1 &&
            box.top >= (headerBox?.bottom ?? 0) - 1 &&
            box.height > 0,
        ),
      cardsWithinWidth: cardBoxes.every((box) => box.left >= -1 && box.right <= viewport.width + 1),
      // A long name must be clipped by its card, never widen it.
      namesWithinCard: cards.every((card) => {
        const label = card.querySelector("p[title]");
        if (label === null) {
          return true;
        }
        return label.getBoundingClientRect().width <= rect(card).width + 1;
      }),
      // At least one name must actually be truncated, which proves the long-name
      // path is exercised rather than merely absent.
      truncatedNameCount: cards.filter((card) => {
        const label = card.querySelector("p[title]");
        return label !== null && label.scrollWidth > label.clientWidth + 1;
      }).length,
      // Names that do not fit, and whether something actually clips them. The
      // card is the boundary that matters: a name may be ellipsised or simply
      // cut off, but it must never widen the card or escape it.
      overflowingNameCount: cards.filter((card) => {
        const label = card.querySelector("p[title]");
        return label !== null && label.scrollWidth > label.clientWidth + 1;
      }).length,
      overflowingNamesAreClipped: cards.every((card) => {
        const label = card.querySelector("p[title]");
        if (label === null) return true;
        if (label.scrollWidth <= label.clientWidth + 1) return true;
        // The clip may sit on the name itself or on the card that contains it.
        const clips = (element) => {
          const style = getComputedStyle(element);
          return style.overflow !== "visible" || style.textOverflow === "ellipsis";
        };
        return clips(label) || clips(card);
      }),
    };
  });

const auditJoinScreen = (page) =>
  page.evaluate(() => {
    const scroller = document.scrollingElement ?? document.documentElement;
    const joinButton = [...document.querySelectorAll("button")].find((button) =>
      (button.textContent ?? "").includes("Join meeting"),
    );
    const nameField = document.getElementById("display-name");
    const box = joinButton?.getBoundingClientRect();
    const nameBox = nameField?.getBoundingClientRect();
    return {
      verticalOverflow: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
      horizontalOverflow: Math.max(0, scroller.scrollWidth - scroller.clientWidth),
      viewportHeight: window.innerHeight,
      joinButtonBottom: box === undefined ? null : Math.round(box.bottom),
      joinButtonFullyVisible:
        box !== undefined && box !== null && box.bottom <= window.innerHeight + 1 && box.top >= 0,
      nameFieldVisible:
        nameBox !== undefined && nameBox !== null && nameBox.bottom <= window.innerHeight + 1,
    };
  });

/**
 * Records every RTCPeerConnection the app builds and lets a test drive the
 * connection state directly.
 *
 * A real `failed` state is almost impossible to provoke on demand: it needs ICE
 * to time out, and the platform will not fail a connection on request. The bug
 * this guards against is exactly one a real network produces and a mock does
 * not, so the tests need to be able to fake it. The wrapper returns the genuine
 * peer connection untouched, so offer/answer/ICE and the live-audio checks all
 * still run against real WebRTC.
 */
async function instrumentPeerConnections(page) {
  await page.addInitScript(() => {
    const NativePeerConnection = window.RTCPeerConnection;
    const peers = [];

    window.RTCPeerConnection = function (...args) {
      const connection = new NativePeerConnection(...args);
      peers.push(connection);
      return connection;
    };
    window.RTCPeerConnection.prototype = NativePeerConnection.prototype;

    window.__testPeers = peers;
    // `connectionState` is a prototype getter, so an own data property shadows
    // it. The real event is then dispatched so the app's own listener runs.
    window.__setPeerState = (index, state) => {
      const connection = peers[index];

      if (connection === undefined) {
        return false;
      }

      Object.defineProperty(connection, "connectionState", {
        value: state,
        configurable: true,
      });
      connection.dispatchEvent(new Event("connectionstatechange"));
      return true;
    };
  });
}

async function joinAs(browser, meetingCode, name, viewport) {
  const context = await browser.newContext({
    permissions: ["microphone"],
    ...(viewport ? { viewport } : {}),
  });
  const page = await context.newPage();
  const errors = [];

  await instrumentPeerConnections(page);

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  await page.goto(`${WEB}/meet/${meetingCode}`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join meeting" }).click();

  return { context, page, errors };
}

/**
 * Opens the join screen and stops there. `joinAs` cannot be reused for this
 * because it clicks "Join meeting" and replaces the screen under audit.
 */
async function visitJoinScreen(browser, meetingCode, viewport) {
  const context = await browser.newContext({
    permissions: ["microphone"],
    viewport,
  });
  const page = await context.newPage();
  await page.goto(`${WEB}/meet/${meetingCode}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("join-shell").waitFor({ state: "visible", timeout: 20000 });
  return { context, page };
}

const created = await fetch(`${API}/api/meetings`, { method: "POST" });

if (!created.ok) {
  process.stderr.write(
    `Could not create a meeting (${created.status}). Is the backend running on ${API}?\n`,
  );
  process.exit(1);
}

const meeting = await created.json();
process.stdout.write(`meeting: ${meeting.meetingCode}\n\n`);

const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

try {
  const alice = await joinAs(browser, meeting.meetingCode, "Alice");

  const roomVisible = await alice.page
    .getByTestId("room-shell")
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check("room replaces the lobby after clicking Join", roomVisible);

  const lobbyMatches = await alice.page.locator("text=Join audio meeting").count();
  check("lobby is absent from the DOM", lobbyMatches === 0, `matches=${lobbyMatches}`);

  const solo = await alice.page
    .getByTestId("participant-count")
    .filter({ hasText: "1 person here" })
    .isVisible()
    .catch(() => false);
  check("first participant sees '1 person here'", solo);

  const bob = await joinAs(browser, meeting.meetingCode, "Bob");

  const bobRoom = await bob.page
    .getByTestId("room-shell")
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check("second participant reaches the room", bobRoom);

  const aliceSeesTwo = await alice.page
    .getByTestId("participant-count")
    .filter({ hasText: "2 people here" })
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check("first participant sees '2 people here'", aliceSeesTwo);

  const bobSeesTwo = await bob.page
    .getByTestId("participant-count")
    .filter({ hasText: "2 people here" })
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check("second participant sees '2 people here'", bobSeesTwo);

  const aliceAudioReady = await waitForRemoteAudio(alice.page);
  const bobAudioReady = await waitForRemoteAudio(bob.page);
  check("Alice renders a remote audio element", aliceAudioReady);
  check("Bob renders a remote audio element", bobAudioReady);

  const aliceHears = await measureRemoteAudio(alice.page);
  const bobHears = await measureRemoteAudio(bob.page);

  check(
    "Alice receives a live remote audio track",
    aliceHears.tracks > 0 && aliceHears.trackState === "live" && aliceHears.muted === false,
    JSON.stringify(aliceHears),
  );
  check(
    "Bob receives a live remote audio track",
    bobHears.tracks > 0 && bobHears.trackState === "live" && bobHears.muted === false,
    JSON.stringify(bobHears),
  );
  check(
    "audio energy arrives over WebRTC (Alice side)",
    aliceHears.energy > 0.01,
    `rms=${aliceHears.energy}`,
  );
  check(
    "audio energy arrives over WebRTC (Bob side)",
    bobHears.energy > 0.01,
    `rms=${bobHears.energy}`,
  );

  await alice.page.getByRole("button", { name: "Mute microphone" }).click();

  const bobSeesMuted = await bob.page
    .locator('[data-testid="participant-card"] [aria-label="Muted"]')
    .first()
    .waitFor({ state: "attached", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check("muting in one browser is shown to the other", bobSeesMuted);

  // A working mute that nobody can see is indistinguishable from a broken one, so
  // assert the remote card is visibly marked, not merely correct in the DOM.
  const remoteMuteIsVisible = await bob.page
    .locator('[data-testid="participant-muted-label"]')
    .first()
    .isVisible()
    .catch(() => false);
  const remoteMuteBadgeOnAvatar = await bob.page
    .locator('[data-testid="participant-muted-badge"]')
    .first()
    .isVisible()
    .catch(() => false);
  check(
    "the muted participant's card shows a visible Muted label",
    remoteMuteIsVisible,
  );
  check(
    "the muted participant's avatar carries a mic-off badge",
    remoteMuteBadgeOnAvatar,
  );

  // Unmuting must clear the remote indication too, otherwise it latches on.
  await alice.page.getByRole("button", { name: "Unmute microphone" }).click();
  const bobSeesUnmuted = await bob.page
    .locator('[data-testid="participant-muted-label"]')
    .first()
    .waitFor({ state: "detached", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check("unmuting clears the other browser's Muted label", bobSeesUnmuted);

  // ---------------------------------------------------------------------
  // Control bar affordances: a red end-call button, and a tooltip that names the
  // control under the pointer, since the bar is icon-only.
  // ---------------------------------------------------------------------
  const leaveIsRed = await alice.page
    .getByRole("button", { name: "Leave meeting" })
    .evaluate((button) => {
      const computed = getComputedStyle(button).backgroundColor;
      const lab = computed.match(/^lab\(([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/);

      if (lab !== null) {
        // Tailwind v4 emits `lab()` for this fill, and this Chromium exposes
        // neither `CSSStyleValue.to("srgb")` nor an rgb() computed value, so the
        // channels cannot simply be read out. In lab(), a* is the green<->red
        // axis and b* the blue<->yellow one: a red fill sits far along +a*,
        // while amber and the neutral control fill stay near the middle. This
        // separates a real red from both amber and grey without a colour
        // library.
        const a = Number(lab[2]);
        const b = Number(lab[3]);
        return a > 40 && a > b;
      }

      const [r, g, b] = computed.match(/[\d.]+/g).slice(0, 3).map(Number);
      // Red must clearly dominate the other channels, not merely lean warm.
      return r > 150 && r - g > 60 && r - b > 60;
    })
    .catch(() => false);
  check("the end-call button is red", leaveIsRed);

  const micButton = alice.page.getByRole("button", { name: "Mute microphone" });
  const tooltip = alice.page.locator('[data-testid="control-tooltip"]', {
    hasText: "Mute mic",
  });

  // Park the pointer away from the control bar and drop focus first. The mute
  // assertions above click the mic button, which leaves the pointer resting on
  // it and keeps it focused; the tooltip is revealed by `group-hover` *or*
  // `group-focus-within`, so measuring "before hover" without resetting both
  // only measures a hover that is still in effect.
  await alice.page.mouse.move(2, 2);
  await alice.page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await alice.page.waitForTimeout(250);
  const hiddenBeforeHover = await tooltip
    .first()
    .evaluate((element) => getComputedStyle(element).opacity)
    .catch(() => null);
  await micButton.hover();
  // Playwright treats an opacity:0 element as visible, so the opacity itself has
  // to be asserted rather than relying on a visibility check.
  await alice.page.waitForTimeout(250);
  const shownAfterHover = await tooltip
    .first()
    .evaluate((element) => getComputedStyle(element).opacity)
    .catch(() => null);

  check(
    "control tooltips are hidden until the pointer arrives",
    hiddenBeforeHover === "0",
    `opacity=${hiddenBeforeHover}`,
  );
  check(
    "hovering a control reveals its name",
    shownAfterHover === "1",
    `opacity=${shownAfterHover}`,
  );

  const tooltipStaysOnScreen = await tooltip
    .first()
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= window.innerWidth;
    })
    .catch(() => false);
  check("the revealed tooltip stays inside the viewport", tooltipStaysOnScreen);

  // ---------------------------------------------------------------------
  // Responsive audit. A long-named third participant forces the grid into its
  // two-row configuration, so both the comfortable and compact card layouts get
  // measured rather than only the roomiest case.
  // ---------------------------------------------------------------------
  const carol = await joinAs(
    browser,
    meeting.meetingCode,
    "This Is A Very Long Participant Name",
  );
  await carol.page
    .getByTestId("participant-count")
    .filter({ hasText: "3 people here" })
    .waitFor({ state: "attached", timeout: 20000 })
    .then(() => true)
    .catch(() => false);

  // Alice now sees three participants, including the long name.
  await alice.page
    .getByTestId("participant-count")
    .filter({ hasText: "3 people here" })
    .waitFor({ state: "attached", timeout: 20000 });

  // ---------------------------------------------------------------------
  // Connection-failure notice lifecycle.
  //
  // Regression cover for a reported bug: a single failed peer connection
  // latched "Unable to establish an audio connection…" on screen for the rest
  // of the meeting, even after audio was flowing again. The notice has to
  // follow reality in both directions.
  // ---------------------------------------------------------------------
  const CONNECTION_NOTICE = "Unable to establish an audio connection";
  // Scoped to the notice strip on purpose. `getByRole("alert")` also matches
  // Next.js's own visually hidden `__next-route-announcer__`, which is
  // permanently in the document, so an unscoped selector would report a notice
  // that is not there and wait forever for one that is.
  const aliceNotice = alice.page
    .getByTestId("meeting-notice")
    .filter({ hasText: CONNECTION_NOTICE });
  const setPeerState = (index, state) =>
    alice.page.evaluate(
      ([i, s]) => window.__setPeerState(i, s),
      [index, state],
    );
  const alertShowsConnectionNotice = async () => {
    const notice = aliceNotice.first();

    if ((await notice.count()) === 0) {
      return false;
    }

    return (await notice.getAttribute("data-tone")) === "error";
  };

  const peerCount = await alice.page.evaluate(() => window.__testPeers.length);
  check(
    "a failed peer connection raises the connection notice",
    (await setPeerState(0, "failed")) === true &&
      (await aliceNotice.first()
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false)) &&
      (await alertShowsConnectionNotice()),
    `peers=${peerCount}`,
  );

  await setPeerState(0, "connected");
  const clearedOnRecovery = await aliceNotice
    .first()
    .waitFor({ state: "detached", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check(
    "the connection notice clears once the peer connects again",
    clearedOnRecovery,
  );

  // Two participants unreachable at once: recovering one must not hide the
  // other, who is still genuinely unreachable.
  await setPeerState(0, "failed");
  await setPeerState(1, "failed");
  await setPeerState(0, "connected");
  await alice.page.waitForTimeout(300);
  check(
    "the notice stays while another participant is still unreachable",
    await alertShowsConnectionNotice(),
  );

  await setPeerState(1, "connected");
  const clearedWhenAllRecovered = await aliceNotice
    .first()
    .waitFor({ state: "detached", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check(
    "the notice clears once every peer is reachable again",
    clearedWhenAllRecovered,
  );

  for (const viewport of VIEWPORTS) {
    await alice.page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    // Let the resize settle so measurements are not taken mid-layout.
    await alice.page.waitForTimeout(250);

    const layout = await auditLayout(alice.page);
    const suffix = `${viewport.name} (3 participants)`;

    check(
      `${suffix}: page does not scroll vertically`,
      layout.verticalOverflow === 0,
      `overflow=${layout.verticalOverflow}px`,
    );
    check(
      `${suffix}: no horizontal scrolling`,
      layout.horizontalOverflow === 0,
      `overflow=${layout.horizontalOverflow}px`,
    );
    check(
      `${suffix}: grid lays out the expected number of columns`,
      layout.columnCount === expectedColumnsForThree(viewport.width),
      `expected=${expectedColumnsForThree(viewport.width)} actual=${layout.columnCount}`,
    );
    check(
      `${suffix}: all five controls are present`,
      layout.barButtonCount === 5,
      `found=${layout.barButtonCount}`,
    );
    check(
      `${suffix}: control bar is fully visible`,
      layout.barVisible,
    );
    check(
      `${suffix}: touch targets are at least 44px`,
      layout.smallestTouchTarget >= 44,
      `smallest=${layout.smallestTouchTarget}px`,
    );
    check(
      `${suffix}: every control has an accessible label`,
      layout.unlabelledButtons.length === 0,
      layout.unlabelledButtons.join(", "),
    );
    check(
      `${suffix}: header stays compact`,
      layout.headerHeight !== null && layout.headerHeight <= 64,
      `height=${layout.headerHeight}px`,
    );
    check(
      `${suffix}: meeting code chip stays on screen`,
      layout.codeChipVisible,
    );
    check(
      `${suffix}: all ${layout.cardCount} participant cards fit between header and controls`,
      layout.cardsWithinStage,
      `cards=${layout.cardCount}`,
    );
    check(
      `${suffix}: participant cards stay within the viewport width`,
      layout.cardsWithinWidth,
    );
    check(
      `${suffix}: names stay inside their card`,
      layout.namesWithinCard,
    );
    // A name too long for its cell must be clipped by the card rather than
    // spilling out of it. Truncation itself is only required where the text
    // genuinely cannot fit: on a wide desktop card the same name fits outright,
    // so demanding an ellipsis there would assert a rendering bug as a feature.
    check(
      `${suffix}: a name that overflows is clipped, not spilled`,
      layout.overflowingNamesAreClipped,
      `overflowing=${layout.overflowingNameCount} clipped=${layout.overflowingNamesAreClipped}`,
    );
    if (viewport === VIEWPORTS[0]) {
      // The narrowest phone is the one place the fixture name must not fit, so
      // this is where the long-name path is genuinely exercised.
      check(
        `${suffix}: the long name is actually truncated`,
        layout.truncatedNameCount >= 1,
        `truncated=${layout.truncatedNameCount}`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // Crowded room. Past six participants a card can no longer stay legible, so
  // the list is allowed to scroll internally. The page must still not scroll,
  // and the control bar must stay pinned.
  // ---------------------------------------------------------------------
  const extras = [];
  for (const name of ["Dan", "Eve", "Femi", "Gita"]) {
    extras.push(await joinAs(browser, meeting.meetingCode, name));
  }
  await alice.page
    .getByTestId("participant-count")
    .filter({ hasText: "7 people here" })
    .waitFor({ state: "attached", timeout: 30000 })
    .then(() => true)
    .catch(() => false);

  // The short viewport is the case that genuinely cannot fit every card, so it
  // is where the internal list scroll has to take over.
  const CROWDED_VIEWPORTS = [
    ...VIEWPORTS,
    { name: "360x420 (short)", width: 360, height: 420 },
    // Not a real device. Kept as a robustness floor: even a viewport far shorter
    // than any phone must keep the page and the control bar fixed.
    { name: "360x240 (too short)", width: 360, height: 240 },
  ];

  for (const viewport of CROWDED_VIEWPORTS) {
    await alice.page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await alice.page.waitForTimeout(250);
    const crowded = await auditLayout(alice.page);
    const suffix = `${viewport.name} (7 participants)`;

    check(
      `${suffix}: page still does not scroll vertically`,
      crowded.verticalOverflow === 0,
      `overflow=${crowded.verticalOverflow}px`,
    );
    check(
      `${suffix}: no horizontal scrolling`,
      crowded.horizontalOverflow === 0,
      `overflow=${crowded.horizontalOverflow}px`,
    );
    check(
      `${suffix}: control bar still fully visible`,
      crowded.barVisible,
    );
    // Either every card fits, or the list itself absorbs the overflow. What must
    // never happen is the page scrolling or the controls being pushed away.
    check(
      `${suffix}: overflow resolved without moving the page`,
      crowded.listScrollsInternally || crowded.cardsWithinStage,
      crowded.listScrollsInternally
        ? "list scrolls internally"
        : crowded.cardsWithinStage
          ? "all cards fit"
          : "cards overflowed the stage",
    );
  }

  for (const extra of extras) {
    await extra.context.close();
  }
  await carol.context.close();

  // Back to a desktop size for the join-screen audit.
  await alice.page.setViewportSize({ width: 1280, height: 900 });

  for (const viewport of VIEWPORTS) {
    const fresh = await visitJoinScreen(browser, meeting.meetingCode, {
      width: viewport.width,
      height: viewport.height,
    });
    const join = await auditJoinScreen(fresh.page);
    const suffix = `${viewport.name} (join screen)`;

    check(
      `${suffix}: fits on one screen without scrolling`,
      join.verticalOverflow === 0,
      `overflow=${join.verticalOverflow}px`,
    );
    check(
      `${suffix}: no horizontal scrolling`,
      join.horizontalOverflow === 0,
      `overflow=${join.horizontalOverflow}px`,
    );
    check(
      `${suffix}: join button is fully visible without scrolling`,
      join.joinButtonFullyVisible,
      `bottom=${join.joinButtonBottom}px of ${join.viewportHeight}px`,
    );
    check(
      `${suffix}: the name field is reachable`,
      join.nameFieldVisible,
    );

    await fresh.context.close();
  }


  await alice.page.getByRole("button", { name: "Leave meeting" }).click();

  const bobSeesOne = await bob.page
    .getByTestId("participant-count")
    .filter({ hasText: "1 person here" })
    .waitFor({ state: "attached", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check(
    "remaining participant sees '1 person here' after the other leaves",
    bobSeesOne,
  );

  const afterLeave = await fetch(`${API}/api/meetings/${meeting.meetingCode}`);
  check("meeting still exists after leaving", afterLeave.status === 200);

  const allErrors = [...alice.errors, ...bob.errors];
  check("no uncaught console or page errors", allErrors.length === 0, allErrors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.ok);
process.stdout.write(
  `\n${results.length - failed.length}/${results.length} browser checks passed\n`,
);

if (failed.length > 0) {
  process.exitCode = 1;
}
