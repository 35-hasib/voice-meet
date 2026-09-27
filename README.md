# AudioMeet

A production-quality MVP of a permanent-link, **audio-only** meeting application.

Anyone with a meeting link can join without an account, choose a display name,
and talk using their real microphone. Audio travels directly between browsers
over WebRTC. Socket.IO is used only for signaling, and PostgreSQL stores only the
existence of meetings.

This version intentionally has **no video, no screen sharing, no recording, and
no chat**.

---

## 1. Project overview

AudioMeet is three cooperating parts:

```
Next.js frontend (Vercel)
        │  REST (meetings)  +  Socket.IO (signaling only)
        ▼
Express + Socket.IO backend (long-running Node.js host)
        │
        ▼
PostgreSQL (permanent meeting records)
```

Audio never passes through Express and is never written to PostgreSQL:

```
User A ──WebRTC──▶ User B
      (Socket.IO only exchanges SDP and ICE candidates)
```

## 2. Features

- Create a meeting and receive a permanent link such as `https://app.vercel.app/meet/7kF9xP2mQa12`.
- Join with a link only. No login, email, password, or account creation.
- Display name is trimmed, control characters are removed, and length is limited to 40 grapheme characters.
- Microphone permission is requested from an explicit user action and previewed before joining.
- Real WebRTC audio with a mesh topology.
- Working mute/unmute that toggles the local `MediaStreamTrack.enabled` flag and notifies other participants.
- Active-speaker indication using `AudioContext` + `AnalyserNode` (visual only).
- Participant list, connection status, remote playback recovery for browser autoplay rules, and mobile-friendly controls.
- Meeting remains in PostgreSQL when the last participant leaves, when a socket disconnects, or after a backend restart.
- Server-enforced input validation, exact-origin CORS, rate limiting, Helmet security headers, and bounded signaling payloads.
- Short-lived TURN REST credentials issued by the backend (no long-lived TURN secret in the browser bundle).

## 3. Architecture

### Permanent vs. temporary state

| Data | Where it lives | Lifespan |
| --- | --- | --- |
| Meeting existence (`meetingCode`, `status`, timestamps) | PostgreSQL | Permanent until explicitly closed or deleted by an administrator |
| Connected participants | Socket.IO server memory | Until that socket leaves or disconnects |
| Audio | WebRTC peer connections in the browser | Until the call ends |
| Display names, mute state | Socket.IO memory, mirrored into the UI | Until the participant leaves |

Nothing in the meeting record depends on the number of connected participants.
A meeting with zero participants is still a valid, joinable meeting.

### Layering

Backend code is separated by responsibility:

```
backend/src/
├── routes/           HTTP route wiring
├── controllers/      HTTP request/response handling
├── services/         Business rules (meeting lifecycle, ICE credentials)
├── repositories/     Data access (Prisma / test fakes)
├── socket/           Socket.IO signaling, in-memory participants, rate limits
├── middleware/       CORS-adjacent errors, JSON 404, rate limiting
├── config/           Validated environment configuration
└── types/            Shared types and error classes
```

Frontend code keeps browser media, signaling, and presentation separate:

```
frontend/
├── app/              App Router pages, layout, global styles
├── components/       Reusable UI (lobby, room, participant cards, audio)
├── hooks/            Microphone, meeting lookup, WebRTC/socket controller
├── lib/              API client, validation, configuration, ICE merging
├── types/            Shared client-side contracts
└── tests/            Unit tests
```

## 4. Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Lucide React |
| Realtime client | Socket.IO client, native WebRTC APIs |
| Backend | Node.js 22, Express 5, Socket.IO 4, TypeScript (ESM) |
| Database | PostgreSQL via Prisma 6 |
| Validation | Zod |
| Security | Helmet, exact-origin CORS, express-rate-limit, per-socket rate limits |
| Tests | Vitest, Supertest |
| Deployment | Vercel (frontend), Render/Railway/Fly.io/VPS (backend), Neon/any PostgreSQL |

## 5. Folder structure

```
/
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # landing page
│   │   └── meet/[meetingCode]/      # permanent link route
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── types/
│   ├── tests/
│   ├── .env.example
│   └── package.json
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── repositories/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── socket/
│   │   └── types/
│   ├── tests/
│   ├── .env.example
│   └── package.json
├── .gitignore
└── README.md
```

## 6. Prerequisites

- Node.js 22.12+ (the backend pins `>=22.12 <23`)
- npm 10+
- PostgreSQL 14+ (local, Neon, or another managed provider)

## 7. Database setup

Create a PostgreSQL database. A local Docker database is the fastest option:

```bash
docker run --name audiomeet-postgres \
  -e POSTGRES_USER=audiomeet \
  -e POSTGRES_PASSWORD=audiomeet \
  -e POSTGRES_DB=audiomeet \
  -p 5432:5432 \
  -d postgres:17-alpine
```

The connection string for that container is:

```text
postgresql://audiomeet:audiomeet@localhost:5432/audiomeet?schema=public
```

Neon and other managed providers work the same way: copy the connection string into `DATABASE_URL`.

#### Running PostgreSQL without Docker or root

If you cannot install system packages, real PostgreSQL binaries can run from a
user-owned directory. This project was developed that way on a machine with
neither Docker nor a system PostgreSQL:

```bash
mkdir -p ~/.local/share/audiomeet-pg
cd ~/.local/share/audiomeet-pg
npm init -y
npm install embedded-postgres   # ships real PostgreSQL 18 binaries
```

`~/.local/share/audiomeet-pg/start.mjs` initialises a data directory in
`~/.local/share/audiomeet-pg/data`, starts the cluster on `127.0.0.1:5432` with
role `audiomeet` / password `audiomeet` (SCRAM-SHA-256), and creates the
`audiomeet` database:

```bash
cd ~/.local/share/audiomeet-pg
nohup node start.mjs > postgres.log 2>&1 &
```

It keeps running until stopped with `kill <pid>`. The matching local connection
string is:

```text
postgresql://audiomeet:audiomeet@localhost:5432/audiomeet?schema=public
```

This is a development convenience, not a production deployment: it is a single
cluster in your home directory with no backups, no TLS, and no service manager.

### Prisma setup

```bash
cd backend
npm install
cp .env.example .env          # edit DATABASE_URL
npx prisma generate
npx prisma migrate dev --name init
```

The `Meeting` model:

```prisma
enum MeetingStatus {
  ACTIVE
  CLOSED
}

model Meeting {
  id           String        @id @default(cuid())
  meetingCode  String        @unique @db.VarChar(12)
  status       MeetingStatus @default(ACTIVE)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  closedAt     DateTime?
  @@map("meetings")
}
```

`meetingCode` is 12 base64url characters generated from 9 random bytes
(72 bits of entropy) with `crypto.randomBytes`. Codes are never sequential.
A unique-constraint conflict is retried up to five times.

### Meeting status rules

- `ACTIVE` — joinable.
- `CLOSED` — the record is kept, but `GET` returns `410` and socket joins are rejected.
- The MVP has **no public close or delete endpoint**, because anyone with a link could call it. Closing or deleting is an administrative/database action today and a host-control feature in the roadmap.

## 8. Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `PORT` | no | Defaults to `4000` |
| `FRONTEND_URL` | yes | Comma-separated, exact allowed origins, e.g. `http://localhost:3000,https://app.vercel.app` |
| `STUN_SERVER_URL` | no | Comma-separated STUN URLs returned by the credentials endpoint |
| `TURN_PROVIDER` | no | `static` for self-hosted coturn, `cloudflare` for Cloudflare Realtime TURN. Omit for STUN only |
| `TURN_SERVER_URL` | static TURN | Comma-separated `turn:`/`turns:` URLs |
| `TURN_SERVER_USERNAME` | static TURN | 1–64 character persistent identifier, e.g. `audiomeet`. **No `@` and no `:`** |
| `TURN_SERVER_CREDENTIAL` | static TURN | HMAC shared secret for TURN REST credentials — **never** put this in a `NEXT_PUBLIC_` variable |
| `CLOUDFLARE_TURN_KEY_ID` | cloudflare TURN | TURN key ID from the Cloudflare dashboard |
| `CLOUDFLARE_TURN_API_TOKEN` | cloudflare TURN | API token with TURN credential permissions — server-side only |
| `CLOUDFLARE_TURN_TTL_SECONDS` | no | Credential lifetime, default `86400` (24h), clamped to 300–172800 |

Each TURN block is all-or-nothing: setting only some of its variables, or mixing
`TURN_PROVIDER=cloudflare` with the static block, fails startup with a message
naming the problem. `STUN_SERVER_URL` is independent and should be set in both
cases.

`FRONTEND_URL` is an exact allowlist. `*` is rejected at startup. Requests from
an origin that is not listed receive `403 CORS_ORIGIN_DENIED`.

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | yes | REST base URL, e.g. `http://localhost:4000` or `https://api.example.com` |
| `NEXT_PUBLIC_SOCKET_URL` | yes | Socket.IO base URL, normally the same host as the API |
| `NEXT_PUBLIC_STUN_SERVER_URL` | no | Comma-separated public STUN URLs used directly by the browser |
| `NEXT_PUBLIC_API_TIMEOUT_MS` | no | REST request deadline in ms, default `30000`, clamped to 5000–120000. Must exceed the API host's cold-start time |

Never place `DATABASE_URL`, `TURN_SERVER_CREDENTIAL`, or any other secret in a
`NEXT_PUBLIC_` variable. Next.js inlines `NEXT_PUBLIC_` values into the browser
bundle at build time.

Meeting links are built from `window.location.origin`, so the production domain
is never hard-coded in the app.

## 9. Local development

Terminal 1 — database (if you are not already running one):

```bash
docker run --name audiomeet-postgres -e POSTGRES_USER=audiomeet -e POSTGRES_PASSWORD=audiomeet -e POSTGRES_DB=audiomeet -p 5432:5432 -d postgres:17-alpine
```

Terminal 2 — backend:

```bash
cd backend
npm install
cp .env.example .env
# set DATABASE_URL
npx prisma generate
npm run prisma:migrate -- --name init
npm run dev
```

Terminal 3 — frontend:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

### Backend scripts

```bash
npm run dev              # tsx watch
npm run build            # compile to dist/
npm start                # run compiled server
npm run lint             # ESLint
npm run typecheck        # strict tsc
npm test                 # Vitest
npm run prisma:generate
npm run prisma:migrate
```

### Frontend scripts

```bash
npm run dev
npm run build
npm start
npm run lint
npm run typecheck
npm test
```

## 10. REST API

All errors use the shape:

```json
{ "error": { "code": "MEETING_NOT_FOUND", "message": "Meeting not found" } }
```

### `POST /api/meetings`

Creates a meeting and returns `201`:

```json
{
  "id": "clx...",
  "meetingCode": "7kF9xP2mQa12",
  "status": "ACTIVE",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "closedAt": null
}
```

Rate limited to 10 creations per IP per minute. A general API limit of 300
requests per IP per 15 minutes also applies.

### `GET /api/meetings/:meetingCode`

- `200` with the meeting object when `ACTIVE`
- `400 INVALID_MEETING_CODE` when the code is not 12 base64url characters
- `404 MEETING_NOT_FOUND` when the record does not exist
- `410 MEETING_CLOSED` when the record exists but is closed

### `GET /api/rtc/credentials?meetingCode=:meetingCode`

Validates the meeting first, then returns ICE servers:

```json
{ "iceServers": [{ "urls": "stun:stun.example.com:3478" }] }
```

If TURN is configured, the response also contains a TURN server with a
**short-lived** username and HMAC-derived credential (5-minute TTL). The shared
secret is never returned.

### `GET /health` and `GET /api/health`

Liveness endpoints for hosting platforms and for debugging a deployment. Both
return immediately and touch no database, cache, or socket state, so a slow
response indicates the Node process itself is unhealthy (typically a cold start)
rather than a database problem.

```json
{ "status": "ok", "service": "voice-meet-api" }
```

`/api/health` is registered ahead of the `/api` rate limiter so that health
checks can never be throttled.

## 11. Socket.IO signaling protocol

Socket.IO is used only for signaling and meeting events. It never carries audio.

Join payload (trimmed server-side; names longer than 40 grapheme clusters or
containing control characters are rejected):

```json
{ "meetingCode": "7kF9xP2mQa12", "displayName": "Hasib" }
```

### Client → server

| Event | Payload | Notes |
| --- | --- | --- |
| `meeting:join` | `{ meetingCode, displayName }` + optional ack | Checks PostgreSQL for an `ACTIVE` meeting first. The server joins the socket to room `meeting:<code>` in memory and emits `meeting:joined`. |
| `meeting:leave` | none | Removes the participant from memory only. |
| `webrtc:offer` | `{ targetParticipantId, sdp }` | Relayed only if sender and target are in the same room. |
| `webrtc:answer` | `{ targetParticipantId, sdp }` | Same room validation. |
| `webrtc:ice-candidate` | `{ targetParticipantId, candidate, sdpMid?, sdpMLineIndex?, usernameFragment? }` | Same room validation; candidates are queued client-side until the remote description exists. |
| `participant:state` | `{ muted }` | Updates the in-memory mute flag and broadcasts `participant:state`. |

`meeting:join` accepts an optional Socket.IO acknowledgement:

```json
{ "ok": true }
```

```json
{ "ok": false, "error": { "code": "MEETING_CLOSED", "message": "Meeting is closed" } }
```

### Server → client

| Event | Payload |
| --- | --- |
| `meeting:joined` | `{ self: { participantId, displayName, muted }, participants: Participant[] }` |
| `participant:joined` | `{ participantId, displayName, muted }` |
| `participant:left` | `{ participantId }` |
| `participant:state` | `{ participantId, muted }` |
| `webrtc:offer` | `{ participantId, targetParticipantId, sdp }` |
| `webrtc:answer` | `{ participantId, targetParticipantId, sdp }` |
| `webrtc:ice-candidate` | `{ participantId, targetParticipantId, candidate, sdpMid?, sdpMLineIndex?, usernameFragment? }` |

Forwarded payloads always include the sender's `participantId` so the receiver
knows which peer connection the message belongs to.

### Signaling safety

- `maxHttpBufferSize` is 64 KB per socket.
- SDP is limited to 48 KB, ICE candidates to 8 KB, display names to 40 characters.
- Every signaling payload is validated with Zod and rejected silently when invalid.
- Per-socket limits: 5 join attempts per 60 seconds, 120 signaling events per 10 seconds.
- Participants are stored in a `Map` in the backend process. There is no database write on join, leave, mute, or disconnect.

## 12. WebRTC design

- Each browser creates one `RTCPeerConnection` per other participant (mesh).
- The participant that receives `meeting:joined` initiates an offer to each already-present participant, which avoids simultaneous-offer glare.
- ICE candidates are buffered until the matching remote description is applied.
- The local microphone track is added to every peer connection.
- Muting sets `audioTrack.enabled = false`. It does not remove the track, and it does not touch a fake UI-only flag.
- Leaving stops local tracks, closes peer connections, emits `meeting:leave`, and disconnects the socket. **The meeting record is untouched.**
- The speaking indicator creates a local `AudioContext` and `AnalyserNode` per analysed stream. It is visual only; no analysis audio is sent to the backend.

### Mesh limitations (important)

Mesh is a pragmatic MVP choice, not a scalable conferencing design. With `n`
participants, every browser holds `n - 1` peer connections and sends its audio
`n - 1` times. Upload bandwidth, CPU, and battery drain grow roughly linearly
per participant, and browser limits make large rooms unreliable. Use the MVP for
small meetings (a handful of participants) and move to an SFU (LiveKit,
mediasoup, or Janus) before targeting large meetings. The current code keeps
signaling, participant state, and media handling separate enough to make that
migration possible.

## 13. Permanent meeting behavior

This is a core guarantee, not an optimization:

- A meeting row is created once and is never deleted by an application code path.
- Leaving, socket disconnects, browser closes, WebRTC closures, and zero-participant states only mutate in-memory state.
- `GET /api/meetings/:meetingCode` keeps working after everyone leaves, after days of inactivity, and after a backend restart.
- The same URL can be used again later by anyone who has it.

Day 1: `/meet/7kF9xP2mQa12` is created and two people join. Everyone leaves. The
row stays.

Day 10: someone opens the same URL. The lookup finds the existing row and the
join screen appears.

Restarting the backend does not affect the meeting because the meeting lives in
PostgreSQL, not in the signaling process.

## 14. STUN and TURN

STUN and TURN are both configurable; no provider is hard-coded.

STUN alone is enough only when a direct ICE path exists. Two peers on different
networks — for example a phone on mobile data behind symmetric NAT and a laptop
on an office network behind a filtering firewall — often have no direct path, so
ICE gathers no usable candidate pair, the peer connection never reaches
`connected`, and the call appears to hang. TURN relays the media in that case.

The lobby and room surfaces a warning when no TURN server is available, because
the failure otherwise looks like a network glitch rather than missing
configuration.

### STUN

`NEXT_PUBLIC_STUN_SERVER_URL` may contain one or more comma-separated STUN URLs.
The frontend merges those with the servers returned by
`GET /api/rtc/credentials`.

### TURN without exposing long-lived secrets

TURN is selected by `TURN_PROVIDER`. There are two supported providers.

#### Cloudflare Realtime TURN (managed)

Cloudflare issues TURN keys that **cannot be used as credentials directly**, so
credentials must be minted through their API and passed through to the browser.
The backend calls it on demand, caches the result for the credential lifetime,
and mints a fresh one 5 minutes before expiry.

```text
TURN_PROVIDER=cloudflare
CLOUDFLARE_TURN_KEY_ID=<TURN key ID>
CLOUDFLARE_TURN_API_TOKEN=<API token>
CLOUDFLARE_TURN_TTL_SECONDS=86400
STUN_SERVER_URL=stun:stun.l.google.com:19302
```

Create the key and token in the Cloudflare dashboard under Calls → TURN. The API
token is a long-term secret, so it stays server-side; the browser only ever
receives the short-lived username and credential that Cloudflare issues.

Their service addresses cover UDP, TCP, and TLS on `turn.cloudflare.com`, which
means it also reaches peers behind networks that block UDP outright. The first
1,000 GB of monthly traffic is free, then $0.05/GB.

If Cloudflare is unreachable or rejects the token, the endpoint logs the failure
and still returns `200` with STUN-only servers. A relay outage therefore degrades
relay capability instead of preventing anyone from joining, and a transient
failure is retried on the next request rather than cached.

#### Self-hosted coturn

Configured with:

```text
TURN_PROVIDER=static
TURN_SERVER_URL=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp
TURN_SERVER_USERNAME=audiomeet
TURN_SERVER_CREDENTIAL=<shared HMAC secret>
```

`TURN_SERVER_CREDENTIAL` is treated as a **shared secret**, not as a static
password. When the browser requests ICE credentials, the backend generates a
username of the form `<expiry-unix-time>:<prefix>` and an
`HMAC-SHA1(secret, username)` credential with a 5-minute TTL. Only that
short-lived result is returned to the browser.

The order matters: the TURN server reads the text **before** the first colon as
the expiry timestamp. Emitting `<prefix>:<expiry>` makes the timestamp
non-numeric, and coturn refuses every allocation as already expired.

A browser must ultimately know the credential it uses for a TURN allocation, so
the credential is delivered at runtime through the protected endpoint rather
than baked into the JavaScript bundle. Long-lived secrets stay server-side.

TURN is optional for development. It is strongly recommended in production
because some corporate, symmetric-NAT, and mobile networks cannot establish a
direct peer connection with STUN alone. When no STUN or TURN server is available,
the UI warns that connections may fail.

### Running a TURN server that matches this scheme

Any server speaking the TURN REST API works. The closest match to the shared
secret above is `coturn` started in auth-secret mode, which accepts exactly the
`<prefix>:<expiry>` usernames this backend mints:

```bash
docker run -d --name coturn --restart unless-stopped \
  -p 3478:3478/udp -p 3478:3478/tcp -p 5349:5349/tcp \
  -e TURN_SECRET="$(openssl rand -hex 32)" \
  coturn/coturn -n \
    --listening-port=3478 \
    --tls-listening-port=5349 \
    --fingerprint \
    --use-auth-secret \
    --static-auth-secret="$TURN_SECRET" \
    --realm=turn.example.com \
    --external-ip=<your-public-ip> \
    --min-port=49160 --max-port=49200 \
    --no-multicast-peers \
    --no-cli
```

`--external-ip` matters when the container sits behind NAT, and the
`--min-port`/`--max-port` range must be forwarded on the host. Include the `turns:`
(TLS) URL as well as `turn:` so clients behind networks that block UDP can still
relay over TCP, and expect the public host to need a real static IP — this is
roughly the cost of a small VPS.

Then set the three backend variables and restart:

```text
TURN_SERVER_URL=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp
TURN_SERVER_USERNAME=audiomeet
TURN_SERVER_CREDENTIAL=<the same value as TURN_SECRET>
```

`TURN_SERVER_USERNAME` is only the persistent identifier, must be 1-64 characters matching
`[A-Za-z0-9._~-]`, and must not contain `@` or `:`. All three variables are
required together; setting one or two fails startup with a clear message.

Verify that the backend is now issuing relay credentials:

```bash
curl -s "https://api.example.com/api/rtc/credentials?meetingCode=$CODE"
```

Each entry that carries a `username` and `credential` is a TURN server. The
expiry is embedded in the username and rotates on every call, so a value that
never changes means the server variables were not picked up.

## 15. Security model

- The meeting link is the access mechanism. Anyone who possesses it can attempt
  to join; there is no account system. Treat links as secrets and do not publish
  them.
- Meeting codes are 72-bit random values, not sequential IDs, and are validated
  on every REST and socket entry point.
- Display names are trimmed, control characters are removed, length is limited,
  and rendered as React text (never as HTML).
- The frontend sets `Content-Security-Policy` (default-src `self`,
  `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`,
  `form-action 'self'`), `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, and a `Permissions-Policy` that
  blocks the camera (`camera=(), microphone=(self)`).
- The CSP `connect-src` list is derived at build time from
  `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` (both their HTTP and
  equivalent `ws`/`wss` origins), plus `http://localhost:4000` for local
  development. Update it by redeploying with new environment values.
- `script-src` currently allows `'unsafe-inline'` because Next.js emits an inline
  bootstrap script. Adopting a per-request nonce would remove that, at the cost
  of making the pages dynamic.
- Helmet is enabled on the API.
- CORS uses an exact configured allowlist for both REST and Socket.IO. There is
  no `origin: "*"` configuration.
- Rate limits: meeting creation, general API traffic, socket joins, and socket
  signaling.
- `DATABASE_URL` and TURN secrets are server-side only. HTTPS/WSS are required
  in production; browsers also require a secure context for microphone access
  on non-localhost origins.
- `npm audit` reports 0 vulnerabilities. Prisma CLI 6.19.3 pulls in
  `deepmerge-ts@7.1.5`, which has a published stack-exhaustion advisory
  (GHSA-ggr8-5vv4-36mx) reachable only from `@prisma/config` at build time. A
  `package.json` `overrides` entry pins `deepmerge-ts` to `^8.0.0`; `prisma
  generate`, `prisma validate`, and `prisma migrate status` were re-verified
  against that version. Remove the override only when a Prisma release resolves
  the advisory upstream.

## 16. Deployment

### Frontend → Vercel

1. Import the repository into Vercel and set the root directory to `frontend`.
2. Framework preset: Next.js. Build command `npm run build`. Output is handled
   by Vercel.
3. Add environment variables in Vercel → Settings → Environment Variables:

```text
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_SOCKET_URL=https://api.example.com
NEXT_PUBLIC_STUN_SERVER_URL=stun:stun.example.com:3478
```

4. Redeploy after changing `NEXT_PUBLIC_` values; they are inlined at build time.
5. Add the Vercel production URL to the backend `FRONTEND_URL` allowlist. The
   value must be a bare origin such as `https://your-app.vercel.app` — no path,
   query string, fragment, or credentials. Multiple origins are comma-separated.
   Add `http://localhost:3000` as well if you want to test a local frontend
   against the deployed backend.

Do not run a persistent Socket.IO server inside Next.js route handlers or Vercel
serverless functions. Vercel's WebSocket support is a public beta where each
connection is pinned to a single function instance, so `io.to(room).emit(...)`
does not reliably reach participants held on other instances. Hosting the
backend on a persistent host avoids this; running it entirely on Vercel would
require a Socket.IO Redis adapter plus shared participant and rate-limit state.

### Backend → Render (recommended simple option)

Use a Node web service on Render, Railway, Fly.io, or a VPS. The backend needs a
long-running Node process that stays alive for WebSocket connections.

Build and start commands:

```text
Build:  npm ci && npx prisma generate && npm run build
Start:  npm start
```

Before serving, apply migrations against the production database:

```bash
npx prisma migrate deploy
```

Environment variables: `DATABASE_URL`, `FRONTEND_URL` (include the Vercel
origin), and the optional STUN/TURN variables. Let the platform assign `PORT`
if you prefer; the code defaults to `4000` locally.

The Socket.IO participant store is in process memory, so run a single backend
instance. Multiple instances would need a Socket.IO adapter (Redis) and shared
participant state.

### PostgreSQL → Neon (or any managed PostgreSQL)

Create a Neon project, copy the pooled connection string into the backend
`DATABASE_URL`, and run `npx prisma migrate deploy` as part of the release step.
Neon's pooled URLs work with Prisma; add `?pgbouncer=true` if you use the
transaction pooler.

### Verified against the live production deployment

The backend was deployed to Render with Neon PostgreSQL and re-verified from
outside the deployment. All 18 checks passed against the public URL:

- `GET /health` returns `200`.
- `POST /api/meetings` returns `201` and persists a row in Neon.
- `GET` returns `200` for the new code, `400` for a malformed code, and `404`
  for an unknown code.
- CORS returns `403` for an origin that is not in `FRONTEND_URL`.
- `GET /api/rtc/credentials` returns the configured STUN server and exposes no
  secret material.
- Two real Socket.IO clients over WebSocket: both `meeting:join` acks succeed,
  the second participant sees the first, `participant:joined` is broadcast,
  `webrtc:offer` is relayed to the addressed participant, `participant:state`
  broadcasts, `participant:left` fires on disconnect, and the meeting is still
  resolvable after the room empties.

Two operational notes learned from the live deployment:

- `GET /api/meetings` returns `404 ROUTE_NOT_FOUND`; that path only accepts
  `POST`. Use `curl -X POST` when smoke-testing.
- `FRONTEND_URL` must be a bare origin. A value carrying a path, query string,
  fragment, or credentials is rejected at startup, and the error names the
  offending entry.

### Diagnosing a slow or timing-out first request

A first request to a free-tier Render service can take far longer than any
subsequent one, because the instance is suspended after roughly 15 minutes of
inactivity and must boot before it can answer. Measured on this deployment: a
request that arrived while the instance was asleep exceeded the browser's request
deadline, while the same endpoint answered in 2.4s once the instance was warm.

That failure mode looks like a broken server but is not one. Distinguish it with:

- `curl -w "%{time_total}"` against `/api/health`, twice. The first is slow and
  the second is fast means a cold start, not a hung request.
- The server logs now print `PostgreSQL connected in <n>ms` at startup and
  `POST /api/meetings: done in <n>ms` per request, so a slow request is
  attributable to a specific step instead of guesswork.

The client deadline is `NEXT_PUBLIC_API_TIMEOUT_MS` (default 30s) and must stay
above the worst-case cold start. The durable fix is a paid Render instance, which
does not suspend; a free instance also drops live WebSocket calls when it
suspends.

## 17. Testing

### Automated checks that were run

```text
frontend: npm run lint        pass
frontend: npm run typecheck   pass
frontend: npm test            pass (33 tests)
frontend: npm run build       pass (Next.js 16.3.6 production build)

backend:  npm run lint        pass
backend:  npm run typecheck   pass
backend:  npm test            pass (47 tests across 8 files)
backend:  npm run build       pass
```

Backend tests cover code generation and conflict retry, REST create/get, 400 /
404 / 410 handling, CORS allow/deny, rate limiting, ICE credential validation,
STUN/TURN URL parsing in both `stun:host:port` and `stun://host:port` forms,
Socket.IO payload schemas, per-socket rate limits, CORS origin-format rejection
(trailing slashes allowed; paths, queries, fragments, and credentials rejected
with the offending entry named), and the guarantee that leaving a participant
never deletes the meeting record.

### Verified against a real PostgreSQL database

An end-to-end smoke test was run against a live PostgreSQL 18 instance and a
running backend. All 31 checks passed:

- `POST /api/meetings` returns `201` with a 12-character base64url code; the
  code format is asserted.
- `GET` returns `200` for an existing meeting, `400` for a malformed code, `404`
  for an unknown code, and `410` for a closed meeting.
- CORS returns `403` for an unlisted origin and `201` for the configured origin,
  and a denied request inserts no database row.
- `GET /api/rtc/credentials` returns the configured STUN server and never
  contains the TURN shared secret.
- Two real Socket.IO clients join the same meeting: the second sees the first in
  its participant list, the first is notified of the join, `webrtc:offer` and
  `webrtc:ice-candidate` are relayed to the correct target with the sender's
  participant id attached, and `participant:state` mute changes are broadcast.
- A malformed signaling payload is dropped silently without dropping the socket.
- After both clients disconnect, the meeting still resolves over HTTP and its
  PostgreSQL row still exists with `status = ACTIVE` and `closedAt = null`.
- Meetings accumulate across runs: rows created by earlier runs are still present.
- Setting `status = CLOSED` keeps the row, makes `GET` return `410`, and makes
  `meeting:join` fail with `MEETING_CLOSED`.

### Verified in a real browser with real WebRTC audio

`frontend/scripts/browser-e2e.mjs` drives two headless Chromium pages through
the actual UI with a fake microphone device. All 193 checks pass:

- Clicking "Join meeting" replaces the lobby with the room, and the lobby is
  absent from the DOM.
- The first participant sees "1 person here"; both see "2 people here" once the
  second joins.
- Each page renders a remote audio element whose stream has a **live,
  unmuted** audio track.
- **Real audio energy is measured on both sides** through an `AudioContext` /
  `AnalyserNode` attached to the remote stream (RMS around 0.04–0.28), proving
  audio actually crosses the peer connection rather than just establishing.
- Muting in one browser is reflected in the other.
- Leaving updates the remaining participant to "1 person here", and the meeting
  still resolves over HTTP afterwards.
- No uncaught console or page errors.

The same run audits layout across eight widths (320, 360, 375, 390, 412, 430,
768 and 1024 px, plus deliberately short viewports and a seven-participant room).
At each one it asserts that the page never scrolls vertically or horizontally,
that the five controls stay pinned with 44px touch targets, that cards sit
between the header and the control bar, and that the grid resolves to the
expected column count. The last of those is deliberate: a responsive utility
that Tailwind never emitted leaves the class in the DOM while changing nothing,
so only the computed track count proves a breakpoint actually applied.

Run it yourself:

```bash
cd frontend
npm install --no-save playwright
npx playwright install chromium
# with the backend and frontend dev servers running:
node scripts/browser-e2e.mjs
```

Two bugs were found and fixed by this test:

1. The room was rendered as a sibling *after* the lobby's full-height
   `<main>`, so joining pushed the room below the fold and the page looked
   unchanged. The lobby now renders the room *instead of* itself.
2. `useAudioMeeting.leave()` stopped the microphone tracks, but the
   `MediaStream` is owned by `useMicrophone` and passed in as a prop. React 19
   StrictMode double-invokes effects in development, so the teardown pass of the
   simulated unmount destroyed the shared stream. The remount then built peer
   connections around an already-ended track: the connection reported
   `connected` while `getStats()` showed `bytesSent: 0` and the remote track
   stayed permanently muted. `leave()` no longer stops tracks it does not own,
   it refuses to attach dead tracks, and `start()` uses an attempt token so a
   teardown during the async ICE lookup cancels cleanly instead of leaving
   `leavingRef` stuck at `true` (which previously made the Leave button a no-op
   and left the participant ghosted in the room).

### Manual test checklist

These require a real browser and real microphones. The smoke test and the
headless browser test above already cover the data layer, the signaling layer,
and the audio path, so these rows are for confirming real-world conditions that
automation cannot reproduce. None of them have been run, so do not treat them as
passing.

| # | Action | Expected | Covered by |
| --- | --- | --- | --- |
| 1 | Create a meeting | Meeting row appears in PostgreSQL | smoke test |
| 2 | Copy the link, open it in another browser | Join page loads | browser e2e |
| 3 | Join browser A | Participant appears | browser e2e |
| 4 | Join browser B | Both participants appear | browser e2e |
| 5 | Speak in A | B receives audio | browser e2e |
| 6 | Mute A | B sees A as muted and receives no audio from A | browser e2e |
| 7 | Leave A | B sees A leave | browser e2e |
| 8 | Both leave | WebRTC and sockets close; meeting row still exists | smoke + browser e2e |
| 9 | Reopen the URL | Meeting still exists and can be joined again | smoke test |
| 10 | Restart the backend, reopen the URL | Meeting still exists (stored in PostgreSQL) | smoke test |
| 11 | Restart the frontend, reopen the URL | Meeting still exists | manual |
| 12 | Open `/meet/does-not-exist` | "Meeting not found" | smoke test (API 404) |
| 13 | Test on a laptop browser and a phone browser | Mic, mute, leave, and rejoin work on both | manual |

TURN should be verified separately from a network that blocks direct peer
connections (for example a symmetric NAT or restrictive corporate Wi-Fi).

## 18. Known limitations

- Mesh WebRTC does not scale to large meetings; use an SFU for that.
- No authentication, so the link is the only access control.
- No host controls, moderation, waiting room, or meeting lock.
- No video, screen sharing, chat, recording, or transcripts.
- Participant state is in process memory: a single backend instance only.
- Meetings are never cleaned up automatically, so plan a retention policy before
  running a public instance at scale.
- TURN support requires a coturn-compatible TURN REST API deployment.
- Speaking indicators are best-effort visual feedback based on local audio
  analysis.

## 19. Future roadmap

- **Phase 2:** Video and camera on/off
- **Phase 3:** Screen sharing
- **Phase 4:** Text chat
- **Phase 5:** Better participant management
- **Phase 6:** SFU architecture (LiveKit or mediasoup)
- **Phase 7:** Meeting moderation, host controls, meeting lock
- **Phase 8:** Authentication, user accounts, meeting history
- **Phase 9:** Recording

## 20. Verification status

- Automated lint, typecheck, unit/API tests, and production builds pass for both
  applications.
- Prisma migrations were applied to a real PostgreSQL 18 database, and the
  end-to-end smoke test described in section 17 passes all 31 checks, including
  live REST calls, live Socket.IO signaling between two clients, and proof that
  the meeting row survives every participant leaving.
- WebRTC was verified in a real browser: two Chromium pages exchange **audible
  audio** over a mesh peer connection, with mute and leave propagating correctly
  and no console errors.
- Still unverified: TURN traversal from a symmetric NAT or restrictive network,
  and behavior on physical phones and browsers other than Chromium. Those need
  real devices and real networks.
- The deployed backend was verified from outside the deployment: 18/18 live
  production checks pass against the Render URL with Neon PostgreSQL, including
  real two-client WebSocket signaling. The frontend has not yet been verified in
  a browser against the deployed backend, because it still needs to be imported
  into Vercel and the resulting origin added to `FRONTEND_URL`.
