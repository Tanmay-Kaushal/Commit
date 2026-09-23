import { createContext, useContext, useState, type ReactNode } from 'react';
import client from '../api/client';

export type NotifyPrefs = {
  master?: boolean;
  pact_invite?: boolean;
  friend_request?: boolean;
  pact_day_completed?: boolean;
  debt_reminder?: boolean;
  payment_received?: boolean;
};

type User = {
  id: number;
  email: string;
  username: string;
  timezone: string;
  theme: 'light' | 'dark' | 'system';
  currency: string;
  weekStart: 'mon' | 'sun';
  discoverable: boolean;
  notifyPrefs: NotifyPrefs;
};

export type SettingsUpdate = {
  theme?: User['theme'];
  currency?: string;
  weekStart?: User['weekStart'];
  discoverable?: boolean;
  notifyPrefs?: NotifyPrefs;
};

type AuthContextType = {
  user: User | null;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => void;
  updateProfile: (updates: { username?: string; timezone?: string }) => Promise<User>;
  updateSettings: (updates: SettingsUpdate) => Promise<User>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  function persist(user: User, token: string) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
  }

  async function loginWithGoogle(credential: string) {
    // Only used for a brand-new account's initial timezone (see
    // routes/auth.js) — an existing account's own saved value always wins.
    let timezone: string | undefined;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      timezone = undefined;
    }
    const res = await client.post('/auth/google', { credential, timezone });
    persist(res.data.user, res.data.token);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  async function updateProfile(updates: { username?: string; timezone?: string }) {
    const res = await client.put('/auth/me', updates);
    const token = localStorage.getItem('token') || '';
    persist(res.data, token);
    return res.data as User;
  }

  async function updateSettings(updates: SettingsUpdate) {
    const res = await client.put('/settings', updates);
    const token = localStorage.getItem('token') || '';
    persist(res.data, token);
    return res.data as User;
  }

  async function deleteAccount() {
    await client.delete('/auth/me');
    logout();
  }

  return (
    <AuthContext.Provider value={{ user, loginWithGoogle, logout, updateProfile, updateSettings, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
