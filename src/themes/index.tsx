import { createContext, useState, useEffect, type ReactNode } from 'react';
import type { GlobeTheme } from '@openglobes/core';
import { fishTheme } from './fish';
import { bioluminescenceTheme } from './bioluminescence';

export interface ThemeEntry {
  id: string;
  label: string;
  globeTheme: GlobeTheme;
}

export const THEMES: ThemeEntry[] = [
  { id: 'fish', label: 'Deep Ocean', globeTheme: fishTheme },
  { id: 'bioluminescence', label: 'Night Mode', globeTheme: bioluminescenceTheme },
];

interface ThemeContextValue {
  theme: ThemeEntry;
  setThemeId: (id: string) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES[0],
  setThemeId: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('og-theme') ?? 'fish';
    }
    return 'fish';
  });

  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];

  useEffect(() => {
    document.documentElement.dataset.theme = theme.id;
    localStorage.setItem('og-theme', theme.id);
  }, [theme.id]);

  return (
    <ThemeContext.Provider value={{ theme, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  );
}
