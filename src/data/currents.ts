import type { TrailDatum } from '../types';

const WARM = ['#ef476f', '#f9c74f'];
const COLD = ['#4cc9f0', '#56d6a0'];

const BASE: Partial<TrailDatum> = { width: 0.8, dashLength: 0.2, dashGap: 0.1, altitude: 0.003 };

export const OCEAN_CURRENTS: TrailDatum[] = [
  {
    ...BASE,
    id: 'gulf-stream',
    label: 'Gulf Stream',
    color: WARM,
    speed: 9000,
    waypoints: [
      { lat: 25, lng: -80 }, { lat: 27, lng: -79 }, { lat: 30, lng: -78 },
      { lat: 33, lng: -76 }, { lat: 35, lng: -74 }, { lat: 37, lng: -72 },
      { lat: 40, lng: -68 }, { lat: 42, lng: -62 }, { lat: 43, lng: -55 },
      { lat: 45, lng: -47 }, { lat: 48, lng: -40 }, { lat: 50, lng: -32 },
      { lat: 52, lng: -25 }, { lat: 54, lng: -20 }, { lat: 55, lng: -15 },
    ],
  },
  {
    ...BASE,
    id: 'kuroshio',
    label: 'Kuroshio Current',
    color: WARM,
    speed: 10000,
    waypoints: [
      { lat: 15, lng: 125 }, { lat: 18, lng: 123 }, { lat: 22, lng: 121 },
      { lat: 25, lng: 123 }, { lat: 28, lng: 128 }, { lat: 31, lng: 131 },
      { lat: 33, lng: 135 }, { lat: 35, lng: 140 }, { lat: 37, lng: 143 },
      { lat: 38, lng: 145 }, { lat: 40, lng: 155 },
    ],
  },
  {
    ...BASE,
    id: 'antarctic-circumpolar',
    label: 'Antarctic Circumpolar Current',
    color: COLD,
    speed: 12000,
    waypoints: [
      { lat: -57, lng: -70 }, { lat: -58, lng: -50 }, { lat: -58, lng: -30 },
      { lat: -55, lng: -10 }, { lat: -55, lng: 0 }, { lat: -55, lng: 15 },
      { lat: -55, lng: 30 }, { lat: -56, lng: 50 }, { lat: -57, lng: 70 },
      { lat: -56, lng: 90 }, { lat: -55, lng: 110 }, { lat: -56, lng: 130 },
      { lat: -57, lng: 150 }, { lat: -60, lng: 170 }, { lat: -60, lng: -180 },
      { lat: -58, lng: -160 }, { lat: -58, lng: -150 }, { lat: -57, lng: -130 },
      { lat: -57, lng: -110 }, { lat: -57, lng: -70 },
    ],
  },
  {
    ...BASE,
    id: 'humboldt',
    label: 'Humboldt / Peru Current',
    color: COLD,
    speed: 10000,
    waypoints: [
      { lat: -45, lng: -75 }, { lat: -40, lng: -74 }, { lat: -35, lng: -73 },
      { lat: -30, lng: -72 }, { lat: -25, lng: -72 }, { lat: -20, lng: -73 },
      { lat: -15, lng: -76 }, { lat: -10, lng: -79 }, { lat: -5, lng: -82 },
    ],
  },
  {
    ...BASE,
    id: 'benguela',
    label: 'Benguela Current',
    color: COLD,
    speed: 9000,
    waypoints: [
      { lat: -35, lng: 18 }, { lat: -32, lng: 17 }, { lat: -30, lng: 16 },
      { lat: -27, lng: 15 }, { lat: -25, lng: 14 }, { lat: -22, lng: 13 },
      { lat: -20, lng: 12 }, { lat: -17, lng: 11 }, { lat: -15, lng: 11 },
    ],
  },
  {
    ...BASE,
    id: 'north-atlantic-drift',
    label: 'North Atlantic Drift',
    color: WARM,
    speed: 11000,
    waypoints: [
      { lat: 55, lng: -15 }, { lat: 57, lng: -10 }, { lat: 58, lng: -5 },
      { lat: 60, lng: -1 }, { lat: 62, lng: 0 }, { lat: 64, lng: 3 },
      { lat: 65, lng: 5 }, { lat: 68, lng: 10 }, { lat: 70, lng: 15 },
    ],
  },
  {
    ...BASE,
    id: 'agulhas',
    label: 'Agulhas Current',
    color: WARM,
    speed: 9000,
    waypoints: [
      { lat: -15, lng: 40 }, { lat: -18, lng: 38 }, { lat: -20, lng: 36 },
      { lat: -23, lng: 35 }, { lat: -25, lng: 34 }, { lat: -28, lng: 32 },
      { lat: -30, lng: 31 }, { lat: -32, lng: 29 }, { lat: -35, lng: 27 },
      { lat: -37, lng: 22 },
    ],
  },
  {
    ...BASE,
    id: 'california',
    label: 'California Current',
    color: COLD,
    speed: 10000,
    waypoints: [
      { lat: 48, lng: -125 }, { lat: 45, lng: -125 }, { lat: 42, lng: -125 },
      { lat: 39, lng: -124 }, { lat: 37, lng: -123 }, { lat: 34, lng: -120 },
      { lat: 32, lng: -118 }, { lat: 28, lng: -116 }, { lat: 25, lng: -115 },
    ],
  },
  {
    ...BASE,
    id: 'east-australian',
    label: 'East Australian Current',
    color: WARM,
    speed: 8000,
    waypoints: [
      { lat: -15, lng: 150 }, { lat: -18, lng: 151 }, { lat: -20, lng: 153 },
      { lat: -23, lng: 154 }, { lat: -25, lng: 154 }, { lat: -28, lng: 154 },
      { lat: -30, lng: 153 }, { lat: -33, lng: 152 }, { lat: -35, lng: 152 },
      { lat: -38, lng: 151 }, { lat: -40, lng: 150 },
    ],
  },
  {
    ...BASE,
    id: 'equatorial-counter',
    label: 'Equatorial Counter Current',
    color: WARM,
    speed: 11000,
    waypoints: [
      { lat: 5, lng: -140 }, { lat: 5, lng: -155 }, { lat: 5, lng: -170 },
      { lat: 5, lng: -180 }, { lat: 4, lng: 175 }, { lat: 3, lng: 165 },
      { lat: 3, lng: 160 }, { lat: 2, lng: 150 }, { lat: 2, lng: 140 },
    ],
  },
];

export const CURRENTS_DEFAULT_VISIBLE = true; // on by default
