import { ThemeProvider } from '../themes';
import { FishGlobe } from './FishGlobe';

export function App() {
  return (
    <ThemeProvider>
      <FishGlobe />
    </ThemeProvider>
  );
}
