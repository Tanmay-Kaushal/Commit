# Commit

A habit accountability app for two people. You and a partner each commit to
a habit with a stake attached. Every cycle (a week, by default), a scheduled
job checks whether you both kept up your end, and marks the cycle completed
or forfeited. Live status updates between partners, a dispute flow if you
forget to log a check-in, and a full history view of everything that's
happened on a pact.

## Tech stack

**Backend:** Node.js, Express, SQLite (via Node's built-in `node:sqlite`),
Socket.IO, node-cron, Luxon, JWT auth

**Frontend:** React, TypeScript, Vite, Tailwind CSS, React Router

Requires **Node 22.5 or newer**.

## Running it locally

You'll need two terminals open — one for the backend, one for the frontend.

**1. Backend**

```bash
cd backend
npm install
npm start
```

Runs on `http://localhost:4000`. A local SQLite database file is created
automatically on first run — nothing else to set up.

**2. Frontend**

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`.

Open that URL in your browser once both servers are running. In this
two-terminal setup the frontend talks to the backend over
`VITE_API_URL` (`frontend/.env`), same as before.

## Deploying (Railway, one service)

This version builds into a single deployable unit: `npm run build` (at the
repo root) builds the frontend straight into `backend/public`, and the
backend serves both the API and that compiled frontend from one Express
process on one port. That means one Railway service, with **Root
Directory** left as the repo root — no per-service root-directory tracing,
no separate frontend/backend services to wire together.

1. Create one Railway service from this repo (root directory = repo root).
2. Railway's Nixpacks builder picks up `railway.json` automatically:
   - Build: `npm run build`
   - Start: `npm start`
3. Set environment variables on that service:
   - `JWT_SECRET` — required, any long random string.
   - `DB_PATH` — optional; point it at a mounted Railway Volume (e.g.
     `/data/dev.db`) so the SQLite database survives redeploys. Without it,
     the database lives on the container's ephemeral filesystem and resets
     on every deploy.
   - `PORT` is set automatically by Railway — don't set it yourself.
   - You do **not** need `VITE_API_URL`: since the frontend is served by the
     same process as the API, requests default to same-origin in
     production.

Local development still runs backend and frontend as two separate
processes (see above) — that split doesn't change, only how the built app
is deployed.

## How to use it

1. **Sign up.** Create an account with your email and a password.

2. **Create a pact.** From the dashboard, click "New pact" and fill in the
   habit you're committing to, how many times a week you need to do it,
   how much is at stake, how long each cycle should run, and your partner's
   email.

3. **Get your partner to accept.** Your partner needs their own account
   (they can sign up separately). Once they log in, the pact will show up
   on their dashboard with an "Accept" button.

4. **Check in.** Once a pact is active, either of you can hit "Check in"
   from the pact page during the current cycle. You'll see your partner's
   status update live — no need to refresh.

5. **Cycles close automatically.** A background job checks periodically
   whether each cycle has ended, and marks it completed or forfeited based
   on who checked in.

6. **Dispute a forfeit.** If a cycle gets marked forfeited but you actually
   did the habit and just forgot to log it, you can raise a dispute from the
   pact page. Your partner can then approve or reject it.

7. **View history.** Every pact has a "View full history" link showing a
   timeline of everything that's happened — check-ins, cycle outcomes,
   disputes, all in order.

## Notes

This was built as a personal project, not a production app — there's no
password reset, rate limiting, or email verification, and the "frequency
per week" field isn't fully enforced yet (a cycle currently just checks
whether you checked in at all, not how many times). Good enough to run
locally and demo, not meant to be deployed as-is.
