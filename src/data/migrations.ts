import type { ArcDatum } from '@openglobes/core';

// ---------------------------------------------------------------------------
// Migration route data — major fish migration corridors with ALL species
// known to use each route. In reality, many species share corridors.
// ---------------------------------------------------------------------------

const SALMON: [string, string] = ['#ef476f', '#f9c74f'];
const TUNA: [string, string] = ['#4cc9f0', '#56d6a0'];
const EEL: [string, string] = ['#b185db', '#4cc9f0'];
const SHARK: [string, string] = ['#ef476f', '#48bfe6'];
const OTHER: [string, string] = ['#56d6a0', '#f9c74f'];

/** Species that use each named route */
export interface MigrationRoute {
  name: string;
  species: string[];
  description: string;
}

export const MIGRATION_ROUTES: MigrationRoute[] = [
  {
    name: 'North Atlantic Loop',
    species: ['Atlantic Salmon', 'Atlantic Cod', 'Atlantic Herring', 'Atlantic Mackerel', 'Capelin', 'Blue Whiting'],
    description: 'Norway → Iceland → Greenland → return. Shared by salmon, cod, and pelagic shoals following the North Atlantic Drift.',
  },
  {
    name: 'North Pacific Salmon Run',
    species: ['Sockeye Salmon', 'Chinook Salmon', 'Chum Salmon', 'Coho Salmon', 'Pink Salmon', 'Steelhead Trout'],
    description: 'Open Pacific → Alaskan/BC rivers. All Pacific salmon species share this corridor.',
  },
  {
    name: 'Kamchatka Circuit',
    species: ['Pink Salmon', 'Chum Salmon', 'Walleye Pollock', 'Pacific Herring'],
    description: 'North Pacific → Kamchatka Peninsula. Major spawning route for Asian salmon stocks.',
  },
  {
    name: 'Mediterranean–Atlantic Circuit',
    species: ['Bluefin Tuna', 'Swordfish', 'Albacore Tuna', 'Bonito', 'Mediterranean Spearfish'],
    description: 'Mediterranean Sea → mid-Atlantic → Gulf of Mexico. Bluefin tuna spawn in the Med, feed in the Atlantic.',
  },
  {
    name: 'Central Pacific Tuna Highway',
    species: ['Yellowfin Tuna', 'Bigeye Tuna', 'Skipjack Tuna', 'Blue Marlin', 'Wahoo', 'Mahi-mahi'],
    description: 'East Pacific → Central Pacific → Hawaii. The world\'s busiest tuna corridor.',
  },
  {
    name: 'West Pacific Skipjack Run',
    species: ['Skipjack Tuna', 'Yellowfin Tuna', 'Frigate Mackerel', 'Rainbow Runner'],
    description: 'Coral Sea → Central Pacific. Skipjack follow warm currents east seasonally.',
  },
  {
    name: 'Sargasso Sea Eel Migration',
    species: ['European Eel', 'American Eel', 'Conger Eel'],
    description: 'Rivers of Europe/America → Sargasso Sea. One-way spawning migration — adults die after breeding.',
  },
  {
    name: 'Japanese Eel Spawning Run',
    species: ['Japanese Eel', 'Giant Mottled Eel'],
    description: 'Japanese rivers → Mariana Ridge. Deep-ocean spawning, larvae drift back on currents.',
  },
  {
    name: 'Great White Highway',
    species: ['Great White Shark', 'Shortfin Mako', 'Blue Shark', 'Porbeagle'],
    description: 'South Africa → Indian Ocean → Australia. Pelagic shark corridor following seal colonies.',
  },
  {
    name: 'Whale Shark Indo-Pacific',
    species: ['Whale Shark', 'Manta Ray', 'Mobula Ray', 'Remora'],
    description: 'Ningaloo Reef → Indonesia → Maldives. Filter feeders follow plankton blooms.',
  },
  {
    name: 'Caribbean Megafauna Route',
    species: ['Whale Shark', 'Manta Ray', 'Tarpon', 'Permit', 'Bonefish', 'Nassau Grouper'],
    description: 'Yucatán → Belize → Honduras. Seasonal aggregation of large pelagics and reef spawners.',
  },
  {
    name: 'North Atlantic Shark Corridor',
    species: ['Blue Shark', 'Shortfin Mako', 'Porbeagle', 'Basking Shark', 'Thresher Shark'],
    description: 'UK/Ireland → Azores → Caribbean. Sharks follow the Gulf Stream south in winter.',
  },
  {
    name: 'Galápagos Triangle',
    species: ['Hammerhead Shark', 'Whale Shark', 'Galápagos Shark', 'Mola Mola', 'Yellowfin Tuna'],
    description: 'Galápagos → Cocos Island → Malpelo. Upwelling hotspot connecting three marine reserves.',
  },
  {
    name: 'Gulf Stream Express',
    species: ['Mahi-mahi', 'Wahoo', 'Sailfish', 'Blue Marlin', 'Cobia', 'King Mackerel'],
    description: 'Florida → Bahamas → Caribbean. Pelagic gamefish ride the Gulf Stream current.',
  },
  {
    name: 'Trans-Pacific Marlin Route',
    species: ['Blue Marlin', 'Black Marlin', 'Striped Marlin', 'Shortbill Spearfish'],
    description: 'Hawaii → Marshall Islands → Fiji. Billfish follow warm equatorial waters.',
  },
  {
    name: 'Arctic Char Circuit',
    species: ['Arctic Char', 'Arctic Cisco', 'Greenland Halibut', 'Polar Cod'],
    description: 'Norwegian Sea → Svalbard → return. Cold-water species follow seasonal ice edge.',
  },
  {
    name: 'Leatherback Atlantic Crossing',
    species: ['Leatherback Sea Turtle', 'Loggerhead Sea Turtle', 'Ocean Sunfish', 'Blue Shark'],
    description: 'Cape Hatteras → Azores → Cape Verde. Jellyfish feeders cross the open Atlantic.',
  },
];

// Build arcs from routes
export const MIGRATION_ARCS: ArcDatum[] = [];

// Route arc coordinates (same geometry as before, mapped to route names)
const ROUTE_ARCS: Record<string, { coords: [number,number,number,number][]; color: [string,string]; width: number; speed: number; pSpeed: number }> = {
  'North Atlantic Loop': { coords: [[63,8,65,-20],[65,-20,62,-48],[62,-48,63,8]], color: SALMON, width: 0.6, speed: 6000, pSpeed: 2500 },
  'North Pacific Salmon Run': { coords: [[54,-155,58,-157],[45,-130,46,-124]], color: SALMON, width: 0.6, speed: 5000, pSpeed: 2000 },
  'Kamchatka Circuit': { coords: [[50,-170,56,160]], color: SALMON, width: 0.6, speed: 6000, pSpeed: 2200 },
  'Mediterranean–Atlantic Circuit': { coords: [[38,15,35,-30],[35,-30,25,-88]], color: TUNA, width: 0.6, speed: 4500, pSpeed: 1600 },
  'Central Pacific Tuna Highway': { coords: [[10,-110,5,-140],[5,-140,20,-156]], color: TUNA, width: 0.6, speed: 4000, pSpeed: 1500 },
  'West Pacific Skipjack Run': { coords: [[-5,150,0,-170]], color: TUNA, width: 0.6, speed: 4000, pSpeed: 1500 },
  'Sargasso Sea Eel Migration': { coords: [[51,0,45,-5],[45,-5,25,-65],[40,-74,25,-65]], color: EEL, width: 0.6, speed: 8000, pSpeed: 3000 },
  'Japanese Eel Spawning Run': { coords: [[35,136,15,142]], color: EEL, width: 0.6, speed: 7000, pSpeed: 2800 },
  'Great White Highway': { coords: [[-34,26,-30,60],[-30,60,-32,115]], color: SHARK, width: 1.0, speed: 5000, pSpeed: 1800 },
  'Whale Shark Indo-Pacific': { coords: [[-22,114,-8,115],[-8,115,4,73]], color: SHARK, width: 1.0, speed: 6000, pSpeed: 2200 },
  'Caribbean Megafauna Route': { coords: [[21,-87,17,-88],[17,-88,16,-86]], color: SHARK, width: 1.0, speed: 6000, pSpeed: 2200 },
  'North Atlantic Shark Corridor': { coords: [[50,-5,38,-28],[38,-28,18,-65]], color: SHARK, width: 0.6, speed: 4500, pSpeed: 1700 },
  'Galápagos Triangle': { coords: [[0,-91,5,-87],[5,-87,4,-81]], color: SHARK, width: 0.6, speed: 4000, pSpeed: 1600 },
  'Gulf Stream Express': { coords: [[30,-78,25,-77],[25,-77,18,-75]], color: OTHER, width: 0.6, speed: 5000, pSpeed: 2000 },
  'Trans-Pacific Marlin Route': { coords: [[20,-156,7,171],[7,171,-18,178]], color: OTHER, width: 0.6, speed: 5500, pSpeed: 2000 },
  'Arctic Char Circuit': { coords: [[70,20,78,15],[78,15,70,20]], color: SALMON, width: 0.6, speed: 7000, pSpeed: 2800 },
  'Leatherback Atlantic Crossing': { coords: [[35,-75,38,-28],[38,-28,15,-24]], color: OTHER, width: 0.6, speed: 7500, pSpeed: 2800 },
};

let arcIdx = 0;
for (const route of MIGRATION_ROUTES) {
  const cfg = ROUTE_ARCS[route.name];
  if (!cfg) continue;
  for (const [sLat, sLng, eLat, eLng] of cfg.coords) {
    MIGRATION_ARCS.push({
      id: `mig-${arcIdx++}`,
      label: route.name,
      startLat: sLat, startLng: sLng,
      endLat: eLat, endLng: eLng,
      color: cfg.color,
      width: cfg.width,
      speed: cfg.speed,
      particle: true,
      particleSpeed: cfg.pSpeed,
    });
  }
}
