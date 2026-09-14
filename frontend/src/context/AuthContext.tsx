import { createContext, useContext, useState, type ReactNode } from 'react';
import client from '../api/client';

type User = {
  id: number;
  email: string;
  username: string;
  timezone: string;
};

type AuthContextType = {
  user: User | null;
  login: (identifier: string, password: string) => Promise<void>;
  signup: (email: string, password: string, timezone: string, username?: string) => Promise<void>;
  logout: () => void;
  updateProfile: (updates: { username?: string; timezone?: string }) => Promise<User>;
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

  async function login(identifier: string, password: string) {
    const res = await client.post('/auth/login', { identifier, password });
    persist(res.data.user, res.data.token);
  }

  async function signup(email: string, password: string, timezone: string, username?: string) {
    const res = await client.post('/auth/signup', { email, password, timezone, username });
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

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
