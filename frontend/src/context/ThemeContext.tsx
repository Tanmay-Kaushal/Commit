import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeSetting = 'light' | 'dark' | 'system';

type ThemeContextType = {
  theme: ThemeSetting;
  dark: boolean;
  setTheme: (theme: ThemeSetting) => void;
  toggleDark: () => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

function getInitialTheme(): ThemeSetting {
  try {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // localStorage unavailable — fall through to system
  }
  return 'system';
}

function resolveDark(theme: ThemeSetting) {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

// Local light/dark/system toggle layered on top of the existing design —
// same layout and spacing everywhere, dark: variants only swap colors.
// Settings > Appearance (backend `users.theme`) writes here via setTheme,
// so a signed-in user's choice follows them across devices; the quick
// NavBar toggle just flips light/dark locally without touching "system".
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeSetting>(getInitialTheme);
  const [dark, setDark] = useState(() => resolveDark(getInitialTheme()));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    setDark(resolveDark(theme));
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // best-effort persistence only
    }

    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  function setTheme(next: ThemeSetting) {
    setThemeState(next);
  }

  function toggleDark() {
    setThemeState(dark ? 'light' : 'dark');
  }

  return <ThemeContext.Provider value={{ theme, dark, setTheme, toggleDark }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
