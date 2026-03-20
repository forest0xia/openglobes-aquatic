import type { ArcDatum } from '@openglobes/core';

const SALMON: [string, string] = ['#ef476f', '#f9c74f'];
const TUNA: [string, string] = ['#4cc9f0', '#56d6a0'];
const EEL: [string, string] = ['#b185db', '#4cc9f0'];
const SHARK: [string, string] = ['#ef476f', '#48bfe6'];
const OTHER: [string, string] = ['#56d6a0', '#f9c74f'];

export const MIGRATION_ARCS: ArcDatum[] = [
  // --- Atlantic Salmon ---
  { id: 'atlantic-salmon-1', label: 'Atlantic Salmon', startLat: 63, startLng: 8, endLat: 65, endLng: -20, color: SALMON, width: 0.6, speed: 6000, particle: true, particleSpeed: 2500 },
  { id: 'atlantic-salmon-2', label: 'Atlantic Salmon', startLat: 65, startLng: -20, endLat: 62, endLng: -48, color: SALMON, width: 0.6, speed: 6000, particle: true, particleSpeed: 2500 },
  { id: 'atlantic-salmon-3', label: 'Atlantic Salmon', startLat: 62, startLng: -48, endLat: 63, endLng: 8, color: SALMON, width: 0.6, speed: 6000, particle: true, particleSpeed: 2500 },

  // --- Sockeye Salmon ---
  { id: 'sockeye-salmon', label: 'Sockeye Salmon', startLat: 54, startLng: -155, endLat: 58, endLng: -157, color: SALMON, width: 0.6, speed: 5000, particle: true, particleSpeed: 2000 },

  // --- Chinook Salmon ---
  { id: 'chinook-salmon', label: 'Chinook Salmon', startLat: 45, startLng: -130, endLat: 46, endLng: -124, color: SALMON, width: 0.6, speed: 5000, particle: true, particleSpeed: 2000 },

  // --- Pink Salmon ---
  { id: 'pink-salmon', label: 'Pink Salmon', startLat: 50, startLng: -170, endLat: 56, endLng: 160, color: SALMON, width: 0.6, speed: 6000, particle: true, particleSpeed: 2200 },

  // --- Bluefin Tuna ---
  { id: 'bluefin-tuna-1', label: 'Bluefin Tuna', startLat: 38, startLng: 15, endLat: 35, endLng: -30, color: TUNA, width: 0.6, speed: 4500, particle: true, particleSpeed: 1600 },
  { id: 'bluefin-tuna-2', label: 'Bluefin Tuna', startLat: 35, startLng: -30, endLat: 25, endLng: -88, color: TUNA, width: 0.6, speed: 4500, particle: true, particleSpeed: 1600 },

  // --- Yellowfin Tuna ---
  { id: 'yellowfin-tuna-1', label: 'Yellowfin Tuna', startLat: 10, startLng: -110, endLat: 5, endLng: -140, color: TUNA, width: 0.6, speed: 4000, particle: true, particleSpeed: 1500 },
  { id: 'yellowfin-tuna-2', label: 'Yellowfin Tuna', startLat: 5, startLng: -140, endLat: 20, endLng: -156, color: TUNA, width: 0.6, speed: 4000, particle: true, particleSpeed: 1500 },

  // --- Skipjack Tuna ---
  { id: 'skipjack-tuna', label: 'Skipjack Tuna', startLat: -5, startLng: 150, endLat: 0, endLng: -170, color: TUNA, width: 0.6, speed: 4000, particle: true, particleSpeed: 1500 },

  // --- European Eel ---
  { id: 'european-eel-1', label: 'European Eel', startLat: 51, startLng: 0, endLat: 45, endLng: -5, color: EEL, width: 0.6, speed: 8000, particle: true, particleSpeed: 3000 },
  { id: 'european-eel-2', label: 'European Eel', startLat: 45, startLng: -5, endLat: 25, endLng: -65, color: EEL, width: 0.6, speed: 8000, particle: true, particleSpeed: 3000 },

  // --- Japanese Eel ---
  { id: 'japanese-eel', label: 'Japanese Eel', startLat: 35, startLng: 136, endLat: 15, endLng: 142, color: EEL, width: 0.6, speed: 7000, particle: true, particleSpeed: 2800 },

  // --- American Eel ---
  { id: 'american-eel', label: 'American Eel', startLat: 40, startLng: -74, endLat: 25, endLng: -65, color: EEL, width: 0.6, speed: 7500, particle: true, particleSpeed: 3000 },

  // --- Great White Shark ---
  { id: 'great-white-1', label: 'Great White Shark', startLat: -34, startLng: 26, endLat: -30, endLng: 60, color: SHARK, width: 1.0, speed: 5000, particle: true, particleSpeed: 1800 },
  { id: 'great-white-2', label: 'Great White Shark', startLat: -30, startLng: 60, endLat: -32, endLng: 115, color: SHARK, width: 1.0, speed: 5000, particle: true, particleSpeed: 1800 },

  // --- Whale Shark (Indo-Pacific) ---
  { id: 'whale-shark-indo-1', label: 'Whale Shark', startLat: -22, startLng: 114, endLat: -8, endLng: 115, color: SHARK, width: 1.0, speed: 6000, particle: true, particleSpeed: 2200 },
  { id: 'whale-shark-indo-2', label: 'Whale Shark', startLat: -8, startLng: 115, endLat: 4, endLng: 73, color: SHARK, width: 1.0, speed: 6000, particle: true, particleSpeed: 2200 },

  // --- Whale Shark (Americas) ---
  { id: 'whale-shark-am-1', label: 'Whale Shark (Caribbean)', startLat: 21, startLng: -87, endLat: 17, endLng: -88, color: SHARK, width: 1.0, speed: 6000, particle: true, particleSpeed: 2200 },
  { id: 'whale-shark-am-2', label: 'Whale Shark (Caribbean)', startLat: 17, startLng: -88, endLat: 16, endLng: -86, color: SHARK, width: 1.0, speed: 6000, particle: true, particleSpeed: 2200 },

  // --- Blue Shark ---
  { id: 'blue-shark-1', label: 'Blue Shark', startLat: 50, startLng: -5, endLat: 38, endLng: -28, color: SHARK, width: 0.6, speed: 4500, particle: true, particleSpeed: 1700 },
  { id: 'blue-shark-2', label: 'Blue Shark', startLat: 38, startLng: -28, endLat: 18, endLng: -65, color: SHARK, width: 0.6, speed: 4500, particle: true, particleSpeed: 1700 },

  // --- Hammerhead Shark ---
  { id: 'hammerhead-1', label: 'Hammerhead Shark', startLat: 0, startLng: -91, endLat: 5, endLng: -87, color: SHARK, width: 0.6, speed: 4000, particle: true, particleSpeed: 1600 },
  { id: 'hammerhead-2', label: 'Hammerhead Shark', startLat: 5, startLng: -87, endLat: 4, endLng: -81, color: SHARK, width: 0.6, speed: 4000, particle: true, particleSpeed: 1600 },

  // --- Mahi-mahi ---
  { id: 'mahi-mahi-1', label: 'Mahi-mahi', startLat: 30, startLng: -78, endLat: 25, endLng: -77, color: OTHER, width: 0.6, speed: 5000, particle: true, particleSpeed: 2000 },
  { id: 'mahi-mahi-2', label: 'Mahi-mahi', startLat: 25, startLng: -77, endLat: 18, endLng: -75, color: OTHER, width: 0.6, speed: 5000, particle: true, particleSpeed: 2000 },

  // --- Swordfish ---
  { id: 'swordfish', label: 'Swordfish', startLat: 40, startLng: 18, endLat: 45, endLng: -20, color: OTHER, width: 0.6, speed: 4500, particle: true, particleSpeed: 1800 },

  // --- Blue Marlin ---
  { id: 'marlin-1', label: 'Blue Marlin', startLat: 20, startLng: -156, endLat: 7, endLng: 171, color: OTHER, width: 0.6, speed: 5500, particle: true, particleSpeed: 2000 },
  { id: 'marlin-2', label: 'Blue Marlin', startLat: 7, startLng: 171, endLat: -18, endLng: 178, color: OTHER, width: 0.6, speed: 5500, particle: true, particleSpeed: 2000 },

  // --- Arctic Char ---
  { id: 'arctic-char-1', label: 'Arctic Char', startLat: 70, startLng: 20, endLat: 78, endLng: 15, color: SALMON, width: 0.6, speed: 7000, particle: true, particleSpeed: 2800 },
  { id: 'arctic-char-2', label: 'Arctic Char', startLat: 78, startLng: 15, endLat: 70, endLng: 20, color: SALMON, width: 0.6, speed: 7000, particle: true, particleSpeed: 2800 },

  // --- Leatherback Sea Turtle (bonus) ---
  { id: 'leatherback-1', label: 'Leatherback Sea Turtle', startLat: 35, startLng: -75, endLat: 38, endLng: -28, color: OTHER, width: 0.6, speed: 7500, particle: true, particleSpeed: 2800 },
  { id: 'leatherback-2', label: 'Leatherback Sea Turtle', startLat: 38, startLng: -28, endLat: 15, endLng: -24, color: OTHER, width: 0.6, speed: 7500, particle: true, particleSpeed: 2800 },
];

export const MIGRATION_SPECIES = new Set([
  'atlantic-salmon',
  'sockeye-salmon',
  'chinook-salmon',
  'pink-salmon',
  'bluefin-tuna',
  'yellowfin-tuna',
  'skipjack-tuna',
  'european-eel',
  'japanese-eel',
  'american-eel',
  'great-white-shark',
  'whale-shark',
  'blue-shark',
  'hammerhead-shark',
  'mahi-mahi',
  'swordfish',
  'blue-marlin',
  'arctic-char',
  'leatherback-sea-turtle',
]);
