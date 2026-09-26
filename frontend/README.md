# AudioMeet frontend

Next.js App Router frontend for the AudioMeet MVP.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, and optionally
`NEXT_PUBLIC_STUN_SERVER_URL`. The Express + Socket.IO backend runs separately
on port 4000 by default.

See the repository `README.md` for full setup, database, deployment, and testing
instructions.
