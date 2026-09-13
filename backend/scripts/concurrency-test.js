// A quick manual test: fires two simultaneous check-in requests for the
// same user + cycle and confirms only one succeeds (the other gets a 409),
// instead of both silently writing duplicate rows.
//
// Run with the backend already running: node scripts/concurrency-test.js

const BASE = 'http://localhost:4000/api';

async function main() {
  const email = `race-test-${Date.now()}@test.com`;

  const signupRes = await fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'testpass123', timezone: 'UTC' }),
  });
  const { token, user } = await signupRes.json();

  const partnerEmail = `race-partner-${Date.now()}@test.com`;
  const partnerSignupRes = await fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: partnerEmail, password: 'testpass123', timezone: 'UTC' }),
  });
  const { token: partnerToken } = await partnerSignupRes.json();

  const pactRes = await fetch(`${BASE}/pacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      habitDescription: 'race condition test',
      frequencyPerWeek: 3,
      stakeAmount: 10,
      cycleLengthDays: 7,
      partnerEmail,
    }),
  });
  const pact = await pactRes.json();

  // partner needs to accept before the pact is active and check-ins are allowed
  await fetch(`${BASE}/pacts/${pact.id}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${partnerToken}` },
  });

  console.log(`Firing 5 simultaneous check-in requests for user ${user.email}...`);

  const requests = Array.from({ length: 5 }, () =>
    fetch(`${BASE}/checkins/${pact.id}/checkin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.status)
  );

  const results = await Promise.all(requests);
  const successCount = results.filter((s) => s === 200).length;
  const conflictCount = results.filter((s) => s === 409).length;

  console.log('Results:', results);
  console.log(`Successful check-ins: ${successCount} (expected: 1)`);
  console.log(`Conflicts (409): ${conflictCount} (expected: 4)`);

  if (successCount === 1 && conflictCount === 4) {
    console.log('✅ Race condition handled correctly — no duplicate check-ins.');
  } else {
    console.log('❌ Unexpected result — check the unique constraint / insert logic.');
  }
}

main().catch(console.error);
