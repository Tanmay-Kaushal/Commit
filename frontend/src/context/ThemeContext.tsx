import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type ThemeContextType = {
  dark: boolean;
  toggleDark: () => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

function getInitialDark() {
  try {
    const stored = localStorage.getItem('theme');
    if (stored) return stored === 'dark';
  } catch {
    // localStorage unavailable — fall through to system preference
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

// Just a manual light/dark toggle layered on top of the existing design —
// same layout and spacing everywhere, dark: variants only swap colors.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(getInitialDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {
      // best-effort persistence only
    }
  }, [dark]);

  function toggleDark() {
    setDark((d) => !d);
  }

  return <ThemeContext.Provider value={{ dark, toggleDark }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
