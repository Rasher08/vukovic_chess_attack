'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { THEME_KEY } from '@/lib/theme';

type Theme = 'light' | 'dark';
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({ theme: 'light', toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    function sync() {
      let next: Theme = media.matches ? 'dark' : 'light';
      try { const saved = window.localStorage.getItem(THEME_KEY); if (saved === 'light' || saved === 'dark') next = saved; } catch { /* The theme still works when storage is unavailable. */ }
      document.documentElement.dataset.theme = next;
      setTheme(next);
    }
    const storageChanged = (event: StorageEvent) => { if (event.key === THEME_KEY || event.key === null) sync(); };
    sync();
    media.addEventListener('change', sync);
    window.addEventListener('storage', storageChanged);
    return () => { media.removeEventListener('change', sync); window.removeEventListener('storage', storageChanged); };
  }, []);

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { window.localStorage.setItem(THEME_KEY, next); } catch { /* Retain the selection for this page. */ }
  }
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
