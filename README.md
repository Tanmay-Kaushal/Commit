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

Runs on `http://localhost:5174`.

Open that URL in your browser once both servers are running.

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
