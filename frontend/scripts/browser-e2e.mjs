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

async function joinAs(browser, meetingCode, name) {
  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  const errors = [];

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
    .getByText("Audio room")
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check("room replaces the lobby after clicking Join", roomVisible);

  const lobbyMatches = await alice.page.locator("text=Join audio meeting").count();
  check("lobby is absent from the DOM", lobbyMatches === 0, `matches=${lobbyMatches}`);

  const solo = await alice.page
    .getByText("1 person here")
    .isVisible()
    .catch(() => false);
  check("first participant sees '1 person here'", solo);

  const bob = await joinAs(browser, meeting.meetingCode, "Bob");

  const bobRoom = await bob.page
    .getByText("Audio room")
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check("second participant reaches the room", bobRoom);

  const aliceSeesTwo = await alice.page
    .getByText("2 people here")
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check("first participant sees '2 people here'", aliceSeesTwo);

  const bobSeesTwo = await bob.page
    .getByText("2 people here")
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

  await alice.page.getByRole("button", { name: /Mute|Unmute/ }).first().click();

  const bobSeesMuted = await bob.page
    .getByText("Muted")
    .first()
    .waitFor({ state: "visible", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check("muting in one browser is shown to the other", bobSeesMuted);

  await alice.page.getByRole("button", { name: "Leave" }).click();

  const bobSeesOne = await bob.page
    .getByText("1 person here")
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  const bobHeader = await bob.page
    .locator("h1")
    .first()
    .textContent()
    .catch(() => "(unavailable)");
  check(
    "remaining participant sees '1 person here' after the other leaves",
    bobSeesOne,
    `header="${bobHeader?.trim()}"`,
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
