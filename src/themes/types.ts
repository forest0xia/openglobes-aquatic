/**
 * AquaticTheme — local theme interface for the aquatic globe.
 *
 * Contains only the fields actually consumed by GlobeRenderer and UI.
 * Replaces the @openglobes/core GlobeTheme type.
 */
export interface AquaticTheme {
  id: string;
  name: string;
  globeTexture: string;
  atmosphereColor: string;
  backgroundColor: string;
  terrain?: {
    textureUrl?: string;
    bumpMap?: string;
    bumpScale?: number;
    specularMap?: string;
    specularColor?: string;
    shininess?: number;
  };
  colors: {
    primary: string;
    surface: string;
    text: string;
    textMuted: string;
    accent: string;
  };
}
