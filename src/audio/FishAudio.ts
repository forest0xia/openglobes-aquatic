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

function playWhaleSong(ctx: AudioContext, dest: AudioNode): void {
  // Humpback whale song — real range 80–4000 Hz, most stable band 250–475 Hz
  // Units last several seconds, frequency-modulated sweeps with vibrato
  // Source: Au et al. 2006 — "Acoustic properties of humpback whale songs"
  const now = ctx.currentTime;
  const duration = 2.5 + Math.random() * 1.5;

  // Primary tone — sweeps through the characteristic 250–475 Hz band
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  const baseFreq = 200 + Math.random() * 200; // 200–400 Hz
  const peakFreq = 400 + Math.random() * 600;  // sweep up to 400–1000 Hz
  const endFreq = 150 + Math.random() * 150;   // settle lower

  osc.type = 'sine';
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.linearRampToValueAtTime(peakFreq, now + duration * 0.35);
  osc.frequency.linearRampToValueAtTime(baseFreq * 1.2, now + duration * 0.6);
  osc.frequency.linearRampToValueAtTime(endFreq, now + duration);

  // Vibrato — characteristic wavering, 4–7 Hz modulation
  const vibrato = ctx.createOscillator();
  const vibratoGain = ctx.createGain();
  vibrato.frequency.value = 4 + Math.random() * 3;
  vibratoGain.gain.value = 15 + Math.random() * 25; // deeper modulation
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc.frequency);
  vibrato.start(now);
  vibrato.stop(now + duration);

  // Second harmonic — adds the upper frequency richness (up to 4 kHz)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(baseFreq * 3, now);
  osc2.frequency.linearRampToValueAtTime(peakFreq * 2.5, now + duration * 0.35);
  osc2.frequency.linearRampToValueAtTime(endFreq * 2, now + duration);
  gain2.gain.setValueAtTime(0, now);
  gain2.gain.linearRampToValueAtTime(0.08, now + 0.4);
  gain2.gain.linearRampToValueAtTime(0, now + duration);
  osc2.connect(gain2);
  gain2.connect(dest);
  osc2.start(now);
  osc2.stop(now + duration);

  // Envelope — slow attack, sustained, slow release
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.35, now + 0.4);
  gain.gain.setValueAtTime(0.35, now + duration * 0.7);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  // Warm low-pass — allow the characteristic frequency content through
  filter.type = 'lowpass';
  filter.frequency.value = 2000; // raised from 400 to let harmonics through
  filter.Q.value = 1;

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  osc.start(now);
  osc.stop(now + duration);
}

function playWhaleClick(ctx: AudioContext, dest: AudioNode): void {
  // Sperm whale echolocation clicks — real: broadband 300 Hz–30 kHz,
  // centroid 15 kHz, ~100μs on-axis, ICI 0.5–2s. Loudest bio-sound: 236 dB.
  // For audible simulation we use broadband noise impulses at 2–8 kHz
  // with realistic inter-click intervals of 0.5–1s.
  // Source: Møhl et al. 2003 — "The monopulsed nature of sperm whale clicks"
  const now = ctx.currentTime;
  const clickCount = 3 + Math.floor(Math.random() * 4);

  for (let i = 0; i < clickCount; i++) {
    // Realistic ICI: 0.5–1.0 seconds between clicks
    const t = now + i * (0.5 + Math.random() * 0.5);

    // Broadband impulse via noise — much more realistic than a square wave
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 0.008);

    const gain = ctx.createGain();
    const bp = ctx.createBiquadFilter();
    const hp = ctx.createBiquadFilter();

    // Bandpass centered at 4–8 kHz (the audible portion of the real spectrum)
    bp.type = 'bandpass';
    bp.frequency.value = 4000 + Math.random() * 4000;
    bp.Q.value = 2;

    hp.type = 'highpass';
    hp.frequency.value = 2000;

    // Very sharp attack/decay — mimics the impulsive nature
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.4, t + 0.0005); // 0.5ms attack
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.006); // 6ms decay

    noise.connect(hp);
    hp.connect(bp);
    bp.connect(gain);
    gain.connect(dest);

    noise.start(t);
    noise.stop(t + 0.008);
  }
}

function playDolphinWhistle(ctx: AudioContext, dest: AudioNode): void {
  // Bottlenose dolphin signature whistle — real: 7–15 kHz fundamental,
  // frequency-modulated sweeps up to 23 kHz, duration <1s.
  // Each individual has a unique "signature" contour.
  // Source: Dolphins.org acoustics; DOSITS individual-specific vocalizations
  const now = ctx.currentTime;
  const duration = 0.4 + Math.random() * 0.6; // <1s

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Signature whistle contour — sweep through 7–15 kHz
  const startFreq = 7000 + Math.random() * 3000;  // 7–10 kHz
  const peakFreq = 12000 + Math.random() * 5000;   // up to 12–17 kHz
  const endFreq = 6000 + Math.random() * 3000;     // settle 6–9 kHz

  osc.type = 'sine';
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(peakFreq, now + duration * 0.3);
  osc.frequency.exponentialRampToValueAtTime(startFreq * 0.9, now + duration * 0.6);
  osc.frequency.exponentialRampToValueAtTime(peakFreq * 0.8, now + duration * 0.8);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
  gain.gain.setValueAtTime(0.12, now + duration * 0.85);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  osc.connect(gain);
  gain.connect(dest);

  osc.start(now);
  osc.stop(now + duration);
}

function playDolphinClick(ctx: AudioContext, dest: AudioNode): void {
  // Dolphin echolocation click train — real: 40–150 kHz, 50–128μs each,
  // rapid trains. Real clicks are ultrasonic; we pitch down to 8–16 kHz
  // (the human-audible range) to represent them.
  // Click trains accelerate into a "creak" during prey capture.
  // Source: SeaWorld/DOSITS — bottlenose dolphin communication
  const now = ctx.currentTime;
  const burstCount = 8 + Math.floor(Math.random() * 12);

  // Accelerating click train (mimics the "creak" behavior)
  let t = now;
  for (let i = 0; i < burstCount; i++) {
    // Inter-click interval decreases (accelerates) like a real click train
    const ici = 0.08 - (i / burstCount) * 0.06; // 80ms → 20ms
    t += Math.max(0.015, ici);

    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 0.003);
    const gain = ctx.createGain();
    const bp = ctx.createBiquadFilter();

    // Pitched-down representation of the broadband ultrasonic click
    bp.type = 'bandpass';
    bp.frequency.value = 8000 + Math.random() * 8000; // 8–16 kHz
    bp.Q.value = 3;

    // Very short impulse — ~1ms
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.0003);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.002);

    noise.connect(bp);
    bp.connect(gain);
    gain.connect(dest);

    noise.start(t);
    noise.stop(t + 0.003);
  }
}

function playShrimpSnap(ctx: AudioContext, dest: AudioNode): void {
  // Snapping shrimp cavitation pop — real: extremely broadband 2–200 kHz,
  // peak 2–5 kHz, duration only 0.5–1ms, 190 dB source level.
  // The loudest invertebrate sound — a cavitation bubble collapse.
  // Source: Alpheidae Wikipedia; Versluis et al. — "cavitation bubble collapse"
  const now = ctx.currentTime;

  // Primary cavitation impulse — ultra-short broadband burst
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.003); // 3ms buffer (real: 0.5–1ms)

  const gain = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  const peak = ctx.createBiquadFilter();

  hp.type = 'highpass';
  hp.frequency.value = 2000; // matches real peak range

  // Peak emphasis at 2–5 kHz
  peak.type = 'peaking';
  peak.frequency.value = 3000 + Math.random() * 2000;
  peak.gain.value = 6;
  peak.Q.value = 1;

  // Extremely sharp attack and decay — mimics cavitation collapse
  gain.gain.setValueAtTime(0.7, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.004); // 4ms total

  noise.connect(hp);
  hp.connect(peak);
  peak.connect(gain);
  gain.connect(dest);

  noise.start(now);
  noise.stop(now + 0.005);
}

function playClownfishPop(ctx: AudioContext, dest: AudioNode): void {
  // Clownfish aggressive chirps/pops — real: 75–1800 Hz, dominant 710–780 Hz,
  // pulse duration ~89ms, produced by rapid jaw teeth clashing.
  // Smaller individuals = higher frequency, shorter pulses.
  // Source: Parmentier et al. 2007 — "Sound production in Amphiprion clarkii"
  const now = ctx.currentTime;
  const popCount = 2 + Math.floor(Math.random() * 3);

  for (let i = 0; i < popCount; i++) {
    const t = now + i * (0.12 + Math.random() * 0.15);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    // Dominant frequency 710–780 Hz with downward sweep
    osc.frequency.setValueAtTime(700 + Math.random() * 100, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.09);

    // Bandpass to shape the characteristic clownfish spectrum
    filter.type = 'bandpass';
    filter.frequency.value = 600;
    filter.Q.value = 1.5;

    // ~89ms pulse
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.1);
  }
}

function playGrouperBoom(ctx: AudioContext, dest: AudioNode): void {
  // Grouper boom — real: 10–500 Hz range. Goliath grouper peaks at 60 Hz,
  // red grouper ~180 Hz. Pulse duration ~132ms. Produced via swim bladder.
  // Source: FAU goliath grouper study; DOSITS red grouper gallery
  const now = ctx.currentTime;

  // Randomly choose between goliath-style (60 Hz) and red-grouper-style (180 Hz)
  const isGoliath = Math.random() > 0.5;
  const baseFreq = isGoliath ? (55 + Math.random() * 15) : (160 + Math.random() * 40);
  const duration = 0.1 + Math.random() * 0.08; // ~100–180ms (close to real 132ms)

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.linearRampToValueAtTime(baseFreq * 0.7, now + duration);

  filter.type = 'lowpass';
  filter.frequency.value = isGoliath ? 120 : 300; // match species range
  filter.Q.value = 2;

  // 1–4 rapid pulses like real grouper calls
  const pulseCount = 1 + Math.floor(Math.random() * 3);
  for (let p = 0; p < pulseCount; p++) {
    const pt = now + p * (duration + 0.05);
    gain.gain.setValueAtTime(0, pt);
    gain.gain.linearRampToValueAtTime(0.45, pt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, pt + duration);
  }

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  osc.start(now);
  osc.stop(now + pulseCount * (duration + 0.05) + 0.05);
}

function playParrotfishCrunch(ctx: AudioContext, dest: AudioNode): void {
  // Parrotfish coral-crunching — real: broadband 200–8000 Hz,
  // two types: CRUNCH (low freq, long) and SCRAPE (high freq, short).
  // Produced by fused jaw teeth + pharyngeal teeth grinding coral.
  // Source: Tricas & Boyle 2021 — "Parrotfish soundscapes"
  const now = ctx.currentTime;
  const crunchCount = 3 + Math.floor(Math.random() * 4);

  for (let i = 0; i < crunchCount; i++) {
    const t = now + i * (0.08 + Math.random() * 0.12);
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 0.06);

    const gain = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    const hp = ctx.createBiquadFilter();

    // Full broadband: 200–8000 Hz (real range)
    hp.type = 'highpass';
    hp.frequency.value = 200;

    lp.type = 'lowpass';
    lp.frequency.value = 6000 + Math.random() * 2000; // up to 8 kHz

    // Alternate between CRUNCH (heavier) and SCRAPE (lighter)
    const isCrunch = Math.random() > 0.4;
    if (isCrunch) {
      lp.frequency.value = 3000 + Math.random() * 1000;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    } else {
      hp.frequency.value = 2000;
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    }

    noise.connect(hp);
    hp.connect(lp);
    lp.connect(gain);
    gain.connect(dest);

    noise.start(t);
    noise.stop(t + 0.06);
  }
}

function playSeahorseClick(ctx: AudioContext, dest: AudioNode): void {
  // Seahorse feeding/courtship click — real: 50–800 Hz, peak 200–232 Hz,
  // duration ~13ms. Produced by supraoccipital-coronet articulation.
  // Has a low-frequency precursor + high-frequency burst + decay.
  // Source: Oliveira et al. 2014; Romanchek et al. 2024
  const now = ctx.currentTime;
  const clickCount = 1 + Math.floor(Math.random() * 3);

  for (let i = 0; i < clickCount; i++) {
    const t = now + i * 0.25;

    // Low-frequency precursor component (~100–200 Hz)
    const oscLow = ctx.createOscillator();
    const gainLow = ctx.createGain();
    oscLow.type = 'sine';
    oscLow.frequency.value = 100 + Math.random() * 100; // 100–200 Hz
    gainLow.gain.setValueAtTime(0, t);
    gainLow.gain.linearRampToValueAtTime(0.1, t + 0.002);
    gainLow.gain.exponentialRampToValueAtTime(0.001, t + 0.008);
    oscLow.connect(gainLow);
    gainLow.connect(dest);
    oscLow.start(t);
    oscLow.stop(t + 0.01);

    // Main click — peak at ~200–232 Hz with brief HF burst
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const bp = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.value = 200 + Math.random() * 50; // peak 200–250 Hz

    bp.type = 'bandpass';
    bp.frequency.value = 250;
    bp.Q.value = 1.5;

    // ~13ms duration
    gain.gain.setValueAtTime(0, t + 0.002);
    gain.gain.linearRampToValueAtTime(0.15, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);

    osc.connect(bp);
    bp.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.02);
  }
}

function playTurtleGrunt(ctx: AudioContext, dest: AudioNode): void {
  // Sea turtle vocalization — real: 200–400 Hz, most sensitive 200–700 Hz.
  // Green sea turtles vocalize in the 200–400 Hz band.
  // Source: Nature 2024 — "response of sea turtles to vocalizations";
  //         DOSITS — "How do sea turtles hear?"
  const now = ctx.currentTime;
  const duration = 0.25 + Math.random() * 0.2;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  // Correct range: 200–400 Hz (was 60–100 Hz which was far too low)
  osc.type = 'sawtooth';
  osc.frequency.value = 200 + Math.random() * 200; // 200–400 Hz

  // Low-pass at 500 Hz to keep it in the natural turtle range
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  filter.Q.value = 1;

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
  gain.gain.setValueAtTime(0.18, now + duration * 0.6);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function playSealBark(ctx: AudioContext, dest: AudioNode): void {
  // Harbor seal / sea lion bark — real: fundamental 30–500 Hz,
  // roars extend to 1.2 kHz, pup calls 270–620 Hz.
  // Cape fur seal bark rate increases with arousal.
  // Source: OCR harbor seal sounds; Frontiers — spotted seal vocalizations
  const now = ctx.currentTime;
  const barkCount = 1 + Math.floor(Math.random() * 2);

  for (let i = 0; i < barkCount; i++) {
    const t = now + i * 0.35;
    const osc = ctx.createOscillator();
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 0.2);

    const oscGain = ctx.createGain();
    const noiseGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const lp = ctx.createBiquadFilter();

    // Fundamental: 270–400 Hz, sweeping down
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(270 + Math.random() * 130, t); // 270–400 Hz
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.18);

    // Bandpass shapes the bark character
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.8;

    // Low-pass at 1.2 kHz (real upper limit of seal roars)
    lp.type = 'lowpass';
    lp.frequency.value = 1200;

    // Bark envelope — sharper attack, longer sustain than before
    oscGain.gain.setValueAtTime(0, t);
    oscGain.gain.linearRampToValueAtTime(0.3, t + 0.008);
    oscGain.gain.setValueAtTime(0.25, t + 0.06);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    // Breathy noise component
    noiseGain.gain.setValueAtTime(0.12, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(filter);
    filter.connect(lp);
    lp.connect(oscGain);
    noise.connect(noiseGain);
    oscGain.connect(dest);
    noiseGain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.2);
    noise.start(t);
    noise.stop(t + 0.2);
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
  whale_song: playWhaleSong,
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
