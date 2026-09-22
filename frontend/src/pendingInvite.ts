// Carries an invite link across the /login detour.
const KEY = 'pendingInviteClaim';
const TTL_MS = 7 * 24 * 3600 * 1000;

type PendingInvite = { type: 'friend' | 'pact'; code: string; savedAt: number };

export function savePendingInvite(type: 'friend' | 'pact', code: string) {
  localStorage.setItem(KEY, JSON.stringify({ type, code, savedAt: Date.now() }));
}

// Reads and clears in one step — claimed at most once.
export function takePendingInvite(): PendingInvite | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  localStorage.removeItem(KEY);
  try {
    const parsed = JSON.parse(raw) as PendingInvite;
    if (!parsed.code || Date.now() - parsed.savedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function pendingInvitePath(invite: PendingInvite) {
  return invite.type === 'friend' ? `/i/${invite.code}` : `/p/${invite.code}`;
}
