import type { Species } from '../hooks/useSpeciesData';

// ---------------------------------------------------------------------------
// FishAudio — procedural marine creature sounds via Web Audio API.
//
// No external audio files needed. All sounds are synthesized in real-time
// using oscillators, noise, and filters to mimic the characteristic sounds
// of different marine species.
//
// Sound categories matched by species name keywords:
//   whale    → low-frequency sweeping songs, clicks
//   dolphin  → whistles, echolocation clicks
//   shrimp   → sharp snapping pop
//   clownfish → staccato pops
//   grouper  → low booming rumble
//   parrotfish → crunching/scraping
//   seahorse → soft clicking
//   turtle   → low grunt
//   seal/sea lion → bark/growl
//   generic fish → bubble sounds
// ---------------------------------------------------------------------------

type SoundCategory =
  | 'whale_song'
  | 'whale_click'
  | 'dolphin_whistle'
  | 'dolphin_click'
  | 'shrimp_snap'
  | 'clownfish_pop'
  | 'grouper_boom'
  | 'parrotfish_crunch'
  | 'seahorse_click'
  | 'turtle_grunt'
  | 'seal_bark'
  | 'fish_bubble';

/** Keyword → sound category mapping. Order matters (first match wins). */
const SPECIES_SOUND_MAP: [RegExp, SoundCategory[]][] = [
  // Whales — multiple sound variants
  [/humpback|座头鲸/i, ['whale_song', 'whale_song', 'whale_click']],
  [/blue whale|蓝鲸/i, ['whale_song', 'whale_click']],
  [/sperm|抹香鲸/i, ['whale_click', 'whale_click', 'whale_song']],
  [/orca|killer|虎鲸/i, ['dolphin_whistle', 'whale_click', 'whale_song']],
  [/whale|鲸/i, ['whale_song', 'whale_click']],
  [/beluga|白鲸/i, ['dolphin_whistle', 'whale_song']],
  [/narwhal|独角鲸/i, ['whale_click', 'whale_song']],

  // Dolphins
  [/dolphin|海豚/i, ['dolphin_whistle', 'dolphin_click', 'dolphin_whistle']],
  [/porpoise|鼠海豚/i, ['dolphin_click', 'dolphin_whistle']],

  // Specific sound-producing fish
  [/clown|小丑鱼|amphiprion/i, ['clownfish_pop']],
  [/grouper|石斑|epinephelus/i, ['grouper_boom']],
  [/parrotfish|鹦嘴鱼|鹦鹉鱼|scaridae|scarus/i, ['parrotfish_crunch']],
  [/seahorse|海马|hippocampus/i, ['seahorse_click']],
  [/shrimp|虾|alphe/i, ['shrimp_snap']],
  [/turtle|海龟|chelonia|caretta/i, ['turtle_grunt']],
  [/seal|海豹|海狮|sea lion/i, ['seal_bark']],

  // Drum fish / Croaker family
  [/drum|croaker|石首|黄花鱼|sciaenidae/i, ['grouper_boom']],
  [/toadfish|蟾鱼/i, ['grouper_boom', 'turtle_grunt']],
  [/damselfish|雀鲷/i, ['clownfish_pop']],
  [/cod|鳕鱼|gadus/i, ['grouper_boom']],

  // Rays and large fish (some produce low sounds)
  [/manta|蝠鲼|ray|鳐/i, ['fish_bubble', 'turtle_grunt']],
];

/** Resolve which sound categories a species can produce. */
function getSoundCategories(species: Species): SoundCategory[] {
  const searchStr = `${species.name} ${species.nameZh} ${species.scientificName}`;
  for (const [pattern, categories] of SPECIES_SOUND_MAP) {
    if (pattern.test(searchStr)) return categories;
  }
  // Default: generic bubble sound for all fish
  return ['fish_bubble'];
}

// ---------------------------------------------------------------------------
// Audio context singleton (lazy-init on first user interaction)
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3; // master volume
    masterGain.connect(audioCtx.destination);
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function getMasterGain(): GainNode {
  getAudioCtx();
  return masterGain!;
}

// ---------------------------------------------------------------------------
// Sound synthesizers — each creates a short procedural sound
// ---------------------------------------------------------------------------

/** Create white noise buffer. */
function createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function playWhaleSOng(ctx: AudioContext, dest: AudioNode): void {
  // Low frequency sweep — the iconic whale song
  const now = ctx.currentTime;
  const duration = 2.5 + Math.random() * 1.5;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  // Random starting frequency and sweep direction
  const baseFreq = 80 + Math.random() * 120;
  const endFreq = baseFreq + (Math.random() - 0.3) * 100;

  osc.type = 'sine';
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.linearRampToValueAtTime(endFreq, now + duration * 0.6);
  osc.frequency.linearRampToValueAtTime(baseFreq * 0.8, now + duration);

  // Add subtle vibrato
  const vibrato = ctx.createOscillator();
  const vibratoGain = ctx.createGain();
  vibrato.frequency.value = 4 + Math.random() * 3;
  vibratoGain.gain.value = 5 + Math.random() * 10;
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc.frequency);
  vibrato.start(now);
  vibrato.stop(now + duration);

  // Envelope
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.3);
  gain.gain.setValueAtTime(0.4, now + duration * 0.7);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  // Low-pass filter for warmth
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  filter.Q.value = 2;

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  osc.start(now);
  osc.stop(now + duration);
}

function playWhaleClick(ctx: AudioContext, dest: AudioNode): void {
  // Series of sperm-whale-style clicks
  const now = ctx.currentTime;
  const clickCount = 3 + Math.floor(Math.random() * 5);

  for (let i = 0; i < clickCount; i++) {
    const t = now + i * (0.12 + Math.random() * 0.08);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'square';
    osc.frequency.value = 800 + Math.random() * 400;

    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 5;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.05);
  }
}

function playDolphinWhistle(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const duration = 0.6 + Math.random() * 0.8;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // High-pitched sweeping whistle
  const startFreq = 2000 + Math.random() * 3000;
  const peakFreq = startFreq + 1000 + Math.random() * 2000;

  osc.type = 'sine';
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.linearRampToValueAtTime(peakFreq, now + duration * 0.4);
  osc.frequency.linearRampToValueAtTime(startFreq * 0.8, now + duration);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
  gain.gain.setValueAtTime(0.15, now + duration * 0.8);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  osc.connect(gain);
  gain.connect(dest);

  osc.start(now);
  osc.stop(now + duration);
}

function playDolphinClick(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const burstCount = 5 + Math.floor(Math.random() * 8);

  for (let i = 0; i < burstCount; i++) {
    const t = now + i * (0.03 + Math.random() * 0.02);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 4000 + Math.random() * 4000;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.02);
  }
}

function playShrimpSnap(ctx: AudioContext, dest: AudioNode): void {
  // Sharp cavitation pop — like a tiny gunshot
  const now = ctx.currentTime;

  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.05);

  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  filter.type = 'highpass';
  filter.frequency.value = 2000;

  gain.gain.setValueAtTime(0.6, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  noise.start(now);
  noise.stop(now + 0.05);
}

function playClownfishPop(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const popCount = 2 + Math.floor(Math.random() * 3);

  for (let i = 0; i < popCount; i++) {
    const t = now + i * (0.1 + Math.random() * 0.15);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600 + Math.random() * 200, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.05);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.08);
  }
}

function playGrouperBoom(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const duration = 0.4 + Math.random() * 0.3;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(100 + Math.random() * 50, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + duration);

  filter.type = 'lowpass';
  filter.frequency.value = 200;
  filter.Q.value = 3;

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function playParrotfishCrunch(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const crunchCount = 3 + Math.floor(Math.random() * 4);

  for (let i = 0; i < crunchCount; i++) {
    const t = now + i * (0.08 + Math.random() * 0.1);
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 0.04);

    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'bandpass';
    filter.frequency.value = 1500 + Math.random() * 1000;
    filter.Q.value = 2;

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    noise.start(t);
    noise.stop(t + 0.04);
  }
}

function playSeahorseClick(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const clickCount = 1 + Math.floor(Math.random() * 2);

  for (let i = 0; i < clickCount; i++) {
    const t = now + i * 0.2;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.value = 1200 + Math.random() * 600;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.03);
  }
}

function playTurtleGrunt(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const duration = 0.3 + Math.random() * 0.2;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'sawtooth';
  osc.frequency.value = 60 + Math.random() * 40;

  filter.type = 'lowpass';
  filter.frequency.value = 150;

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
  gain.gain.setValueAtTime(0.2, now + duration * 0.6);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function playSealBark(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const barkCount = 1 + Math.floor(Math.random() * 2);

  for (let i = 0; i < barkCount; i++) {
    const t = now + i * 0.3;
    const osc = ctx.createOscillator();
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 0.15);

    const oscGain = ctx.createGain();
    const noiseGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200 + Math.random() * 100, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);

    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 1;

    oscGain.gain.setValueAtTime(0, t);
    oscGain.gain.linearRampToValueAtTime(0.25, t + 0.01);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    noiseGain.gain.setValueAtTime(0.1, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(filter);
    filter.connect(oscGain);
    noise.connect(noiseGain);
    oscGain.connect(dest);
    noiseGain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.15);
    noise.start(t);
    noise.stop(t + 0.15);
  }
}

function playFishBubble(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const bubbleCount = 2 + Math.floor(Math.random() * 3);

  for (let i = 0; i < bubbleCount; i++) {
    const t = now + i * (0.06 + Math.random() * 0.1);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const freq = 400 + Math.random() * 800;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.04);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.08);
  }
}

/** Dispatch to the correct synthesizer. */
const SYNTH_MAP: Record<SoundCategory, (ctx: AudioContext, dest: AudioNode) => void> = {
  whale_song: playWhaleSOng,
  whale_click: playWhaleClick,
  dolphin_whistle: playDolphinWhistle,
  dolphin_click: playDolphinClick,
  shrimp_snap: playShrimpSnap,
  clownfish_pop: playClownfishPop,
  grouper_boom: playGrouperBoom,
  parrotfish_crunch: playParrotfishCrunch,
  seahorse_click: playSeahorseClick,
  turtle_grunt: playTurtleGrunt,
  seal_bark: playSealBark,
  fish_bubble: playFishBubble,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Cooldown to prevent sound spam. */
let lastPlayTime = 0;
const HOVER_COOLDOWN = 800; // ms between hover sounds
const CLICK_COOLDOWN = 300; // ms between click sounds

/**
 * Play a hover sound for a species. Short, subtle variant.
 * Has a cooldown to prevent spam during rapid mouse movement.
 */
export function playHoverSound(species: Species): void {
  const now = Date.now();
  if (now - lastPlayTime < HOVER_COOLDOWN) return;
  lastPlayTime = now;

  const ctx = getAudioCtx();
  const dest = getMasterGain();

  // Lower volume for hover
  const hoverGain = ctx.createGain();
  hoverGain.gain.value = 0.4;
  hoverGain.connect(dest);

  const categories = getSoundCategories(species);
  const cat = categories[Math.floor(Math.random() * categories.length)];
  SYNTH_MAP[cat](ctx, hoverGain);
}

/**
 * Play a click/select sound for a species. Full volume, richer variant.
 */
export function playClickSound(species: Species): void {
  const now = Date.now();
  if (now - lastPlayTime < CLICK_COOLDOWN) return;
  lastPlayTime = now;

  const ctx = getAudioCtx();
  const dest = getMasterGain();

  const categories = getSoundCategories(species);
  const cat = categories[Math.floor(Math.random() * categories.length)];
  SYNTH_MAP[cat](ctx, dest);
}

/**
 * Set the master volume (0.0 to 1.0).
 */
export function setVolume(vol: number): void {
  const gain = getMasterGain();
  gain.gain.value = Math.max(0, Math.min(1, vol));
}

/**
 * Get the sound category label for a species (for UI display).
 */
export function getSoundLabel(species: Species): string {
  const categories = getSoundCategories(species);
  const labels: Record<SoundCategory, string> = {
    whale_song: '鲸歌',
    whale_click: '回声定位',
    dolphin_whistle: '海豚哨声',
    dolphin_click: '海豚咔嗒',
    shrimp_snap: '虾弹声',
    clownfish_pop: '弹击声',
    grouper_boom: '低鸣声',
    parrotfish_crunch: '啃珊瑚声',
    seahorse_click: '咔嗒声',
    turtle_grunt: '呼噜声',
    seal_bark: '吠声',
    fish_bubble: '气泡声',
  };
  // Return unique labels
  const unique = [...new Set(categories.map((c) => labels[c]))];
  return unique.join(' / ');
}

/** Dispose audio context (cleanup). */
export function disposeAudio(): void {
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
    masterGain = null;
  }
}
