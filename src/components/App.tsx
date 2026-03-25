import { ThemeProvider } from '../themes';
import { FishGlobe } from './FishGlobe';
import * as loadProgress from '../utils/loadProgress';

// Expose to the inline loading screen script in index.astro
(window as any).__ogLoadProgress = loadProgress;

export function App() {
  return (
    <ThemeProvider>
      <FishGlobe />
    </ThemeProvider>
  );
}
