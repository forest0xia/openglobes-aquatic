export interface GeoLabel {
  name: string;
  lat: number;
  lng: number;
  type: 'ocean' | 'continent' | 'sea' | 'island';
  size: number; // font size multiplier (1 = normal, 2 = large)
}

export const GEO_LABELS: GeoLabel[] = [
  // Oceans (large text)
  { name: 'Pacific Ocean', lat: 0, lng: -150, type: 'ocean', size: 2 },
  { name: 'Atlantic Ocean', lat: 10, lng: -30, type: 'ocean', size: 2 },
  { name: 'Indian Ocean', lat: -15, lng: 75, type: 'ocean', size: 2 },
  { name: 'Arctic Ocean', lat: 75, lng: 0, type: 'ocean', size: 1.5 },
  { name: 'Southern Ocean', lat: -65, lng: 0, type: 'ocean', size: 1.5 },

  // Seas
  { name: 'Mediterranean Sea', lat: 35, lng: 18, type: 'sea', size: 0.8 },
  { name: 'South China Sea', lat: 12, lng: 115, type: 'sea', size: 0.8 },
  { name: 'Caribbean Sea', lat: 15, lng: -75, type: 'sea', size: 0.8 },
  { name: 'Coral Sea', lat: -18, lng: 155, type: 'sea', size: 0.8 },
  { name: 'Arabian Sea', lat: 15, lng: 65, type: 'sea', size: 0.8 },
  { name: 'Bay of Bengal', lat: 12, lng: 88, type: 'sea', size: 0.7 },
  { name: 'Gulf of Mexico', lat: 25, lng: -90, type: 'sea', size: 0.7 },
  { name: 'Sea of Japan', lat: 40, lng: 135, type: 'sea', size: 0.7 },
  { name: 'Red Sea', lat: 20, lng: 38, type: 'sea', size: 0.6 },
  { name: 'Persian Gulf', lat: 27, lng: 51, type: 'sea', size: 0.6 },
  { name: 'Bering Sea', lat: 58, lng: -175, type: 'sea', size: 0.7 },
  { name: 'Tasman Sea', lat: -38, lng: 160, type: 'sea', size: 0.7 },
  { name: 'North Sea', lat: 56, lng: 3, type: 'sea', size: 0.6 },

  // Continents
  { name: 'Africa', lat: 5, lng: 20, type: 'continent', size: 1.5 },
  { name: 'Asia', lat: 45, lng: 90, type: 'continent', size: 1.5 },
  { name: 'Europe', lat: 50, lng: 15, type: 'continent', size: 1.2 },
  { name: 'North America', lat: 45, lng: -100, type: 'continent', size: 1.3 },
  { name: 'South America', lat: -15, lng: -60, type: 'continent', size: 1.3 },
  { name: 'Australia', lat: -25, lng: 135, type: 'continent', size: 1.2 },
  { name: 'Antarctica', lat: -82, lng: 0, type: 'continent', size: 1.2 },

  // Notable islands/regions
  { name: 'Japan', lat: 36, lng: 138, type: 'island', size: 0.7 },
  { name: 'Indonesia', lat: -2, lng: 118, type: 'island', size: 0.8 },
  { name: 'Philippines', lat: 12, lng: 122, type: 'island', size: 0.7 },
  { name: 'Madagascar', lat: -19, lng: 47, type: 'island', size: 0.7 },
  { name: 'New Zealand', lat: -42, lng: 174, type: 'island', size: 0.7 },
  { name: 'Hawaii', lat: 20, lng: -156, type: 'island', size: 0.6 },
  { name: 'Galápagos', lat: -1, lng: -91, type: 'island', size: 0.5 },
  { name: 'Great Barrier Reef', lat: -18, lng: 147, type: 'island', size: 0.6 },
  { name: 'Maldives', lat: 3, lng: 73, type: 'island', size: 0.5 },
  { name: 'Iceland', lat: 65, lng: -18, type: 'island', size: 0.6 },
];
