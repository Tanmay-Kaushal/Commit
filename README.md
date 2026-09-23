# Commit

A habit accountability app for two (or more) people. You and a partner each
commit to a habit over a fixed date range, on chosen days of the week, with
a stake attached. A scheduled job settles each scheduled day automatically:
everyone who checked in splits the stake of everyone who didn't. Live
updates between partners, push notifications when the app isn't open, a
dispute flow if you forget to log a check-in, shareable invite links, and a
full history view of everything that's happened on a pact.

## Tech stack

**Backend:** Node.js, Express, SQLite (via Node's built-in `node:sqlite`),
Socket.IO, Web Push, node-cron, Luxon, JWT auth, Google OAuth (`google-auth-library`)

**Frontend:** React, TypeScript, Vite, Tailwind CSS, React Router

Requires **Node 22.5 or newer**.

## Website

https://commit-0691.up.railway.app/

## How to use it

1. **Sign in with Google.** No separate signup step — signing in with
   Google creates your account automatically on first use.

2. **Create a pact.** From the dashboard, click "New pact" and fill in the
   habit, which days of the week, the date range, and how much is at stake
   per missed day. A partner is optional at creation — invite one now, or
   share the pact's link later.

3. **Invite people.**
   - By email or username, from the "New pact" form or a pact's "+ Add
     participant".
   - By link: "Send pact link" (on the pact page, creator only) — anyone
     who opens it and is logged in gets the same accept/reject popup as a
     direct invite; logged out, they're sent to log in first and land back
     on it after.
   - "Invite friends on Commit" (Profile page) generates your own personal
     link — anyone who opens it becomes your friend automatically.
   - If someone doesn't have an account yet, sending them a friend request
     tells you so and offers your invite link to share with them directly.

4. **A pact activates** once its start date arrives and at least one
   partner has accepted — not before, and it's never auto-cancelled if no
   one has by then; it just keeps waiting. The creator can cancel it
   manually from the pact's "⋯" menu.

5. **Check in.** Once a pact is active, everyone can hit "Check in" from
   the pact page on any scheduled day. Status updates live — no refresh
   needed.

6. **Days settle automatically.** A background job checks every minute
   whether a scheduled day has passed, and settles it: anyone who checked
   in splits the stake of anyone who didn't.

7. **Dispute a forfeit.** If a day gets marked missed but you actually did
   the habit and just forgot to log it, raise a dispute from the pact page
   — another participant can approve or reject it (capped at 3 attempts).

8. **Notifications.** Live in-app popups for invites, friend requests,
   completed days, debts owed, and payments received — and if you enable
   notifications (Profile page), the same events show as a system
   notification when Commit isn't open or visible.

9. **View history.** Every pact has a "View full history" link — check-ins,
   settlements, disputes, all in order.

## Notes

Built as a personal project — not hardened for large-scale production use,
but the essentials (data durability, memory footprint, real auth) have had
a real pass. See `backend/src/db.js` for the SQLite tuning
(prepared-statement caching, indexes, WAL limits, versioned schema
migrations, graceful shutdown) and `backend/src/routes/auth.js` /
`push.js` for the auth/push integrations.