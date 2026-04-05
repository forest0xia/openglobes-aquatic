import { useState, useCallback, useEffect } from 'react';
import { ThemeProvider } from '../themes';
import { FishGlobe } from './FishGlobe';
import { FishEncyclopedia } from './FishEncyclopedia';
import * as loadProgress from '../utils/loadProgress';

// Expose to the inline loading screen script in index.astro
(window as any).__ogLoadProgress = loadProgress;

type Page = 'globe' | 'encyclopedia';

export function App() {
  const [page, setPage] = useState<Page>(() => {
    return window.location.hash === '#encyclopedia' ? 'encyclopedia' : 'globe';
  });

  // Sync hash with page state
  useEffect(() => {
    const onHash = () => {
      setPage(window.location.hash === '#encyclopedia' ? 'encyclopedia' : 'globe');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goGlobe = useCallback(() => {
    window.location.hash = '';
    setPage('globe');
  }, []);

  const goEncyclopedia = useCallback(() => {
    window.location.hash = '#encyclopedia';
    setPage('encyclopedia');
  }, []);

  return (
    <ThemeProvider>
      {page === 'encyclopedia' ? (
        <FishEncyclopedia
          onBack={goGlobe}
          onSelect={() => goGlobe()}
        />
      ) : (
        <FishGlobe onOpenEncyclopedia={goEncyclopedia} />
      )}
    </ThemeProvider>
  );
}
