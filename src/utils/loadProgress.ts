// ---------------------------------------------------------------------------
// loadProgress — global loading progress tracker.
//
// Subsystems register steps and mark them complete. A listener receives
// the 0→1 progress ratio plus the label of the currently active step.
// Used by the inline loading screen in index.astro (no React dependency)
// and by React code that needs to know when to reveal.
// ---------------------------------------------------------------------------

type Listener = (progress: number, done: boolean, label: string) => void;

interface Step {
  weight: number;
  completed: boolean;
  label: string;
}

const steps = new Map<string, Step>();
let listeners: Listener[] = [];
let totalWeight = 0;
let completedWeight = 0;
let currentLabel = '';

function notify(): void {
  const progress = totalWeight > 0 ? completedWeight / totalWeight : 0;
  const done = totalWeight > 0 && completedWeight >= totalWeight;
  for (const fn of listeners) fn(progress, done, currentLabel);
}

/**
 * Register a loading step. Call before the work starts.
 * Weight controls how much of the bar this step occupies relative to others.
 * Label is shown to the user (e.g. "Initializing 3D scene").
 */
export function addStep(id: string, weight = 1, label = ''): void {
  if (steps.has(id)) return;
  steps.set(id, { weight, completed: false, label });
  totalWeight += weight;
  // Set current label to first incomplete step
  if (label && !currentLabel) currentLabel = label;
  notify();
}

/**
 * Mark a step as complete. Advances the current label to the next
 * incomplete step automatically.
 */
export function completeStep(id: string): void {
  const step = steps.get(id);
  if (!step || step.completed) return;
  step.completed = true;
  completedWeight += step.weight;

  // Advance label to next incomplete step
  currentLabel = '';
  for (const [, s] of steps) {
    if (!s.completed && s.label) {
      currentLabel = s.label;
      break;
    }
  }

  notify();
}

/**
 * For multi-item categories (e.g. sprites): register N items under a prefix
 * and complete them individually. Each item gets equal share of the category weight.
 */
export function addBatch(prefix: string, count: number, totalWeight = 1): void {
  if (count <= 0) return;
  const perItem = totalWeight / count;
  for (let i = 0; i < count; i++) {
    addStep(`${prefix}:${i}`, perItem);
  }
}

export function completeBatchItem(prefix: string, index: number): void {
  completeStep(`${prefix}:${index}`);
}

/**
 * Subscribe to progress updates. Returns unsubscribe function.
 */
export function onProgress(fn: Listener): () => void {
  listeners.push(fn);
  // Immediately notify with current state
  const progress = totalWeight > 0 ? completedWeight / totalWeight : 0;
  const done = totalWeight > 0 && completedWeight >= totalWeight;
  fn(progress, done, currentLabel);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

/**
 * Get current progress snapshot.
 */
export function getProgress(): { progress: number; done: boolean; label: string } {
  const progress = totalWeight > 0 ? completedWeight / totalWeight : 0;
  const done = totalWeight > 0 && completedWeight >= totalWeight;
  return { progress, done, label: currentLabel };
}
