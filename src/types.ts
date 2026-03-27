// Local types replacing @openglobes/core exports.
// These are lightweight interfaces — no dependency on the core package.

export interface PointItem {
  id: string;
  lat: number;
  lng: number;
  name: string;
  nameZh?: string;
  rarity?: number;
  [key: string]: unknown;
}

export interface TrailDatum {
  id?: string;
  waypoints: { lat: number; lng: number }[];
  color?: string | string[];
  label?: string;
  width?: number;
  dashLength?: number;
  dashGap?: number;
  speed?: number;
  altitude?: number;
}
