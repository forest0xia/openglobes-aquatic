import { useEffect, useState, useRef } from 'react';

interface DepthEffectProps {
  depth: number; // meters
  onComplete: () => void;
}

export function DepthEffect({ depth, onComplete }: DepthEffectProps) {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [displayDepth, setDisplayDepth] = useState(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);

  // Auto-dismiss after 2s total (fade out starts at 1.5s)
  useEffect(() => {
    const fadeOutTimer = setTimeout(() => setPhase('out'), 1500);
    const completeTimer = setTimeout(onComplete, 2000);
    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  // Animate depth counter from 0 to target over ~1s
  useEffect(() => {
    startTimeRef.current = performance.now();
    const duration = 1000; // 1 second

    function tick(now: number) {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplayDepth(Math.round(eased * depth));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [depth]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        pointerEvents: 'none',
        background:
          'linear-gradient(180deg, transparent 0%, rgba(0,5,15,0.6) 50%, rgba(0,5,15,0.8) 100%)',
        animation:
          phase === 'in'
            ? 'depthFadeIn 300ms ease-out forwards'
            : 'depthFadeOut 500ms ease-in forwards',
      }}
    >
      {/* Vertical depth bar on right side */}
      <div
        style={{
          position: 'absolute',
          right: 40,
          top: '20%',
          bottom: '20%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {/* Surface label */}
        <span
          style={{
            fontFamily: 'var(--og-font-mono)',
            fontSize: 10,
            color: 'var(--og-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          0m
        </span>

        {/* Vertical bar */}
        <div
          style={{
            flex: 1,
            width: 4,
            borderRadius: 2,
            background:
              'linear-gradient(180deg, var(--og-accent) 0%, rgba(76,201,240,0.15) 100%)',
          }}
        />

        {/* Depth value */}
        <span
          style={{
            fontFamily: 'var(--og-font-mono)',
            fontSize: 28,
            fontWeight: 600,
            color: 'var(--og-accent)',
            textShadow: '0 0 20px rgba(76,201,240,0.4)',
          }}
        >
          {displayDepth}m
        </span>

        {/* Depth label */}
        <span
          style={{
            fontFamily: 'var(--og-font-mono)',
            fontSize: 10,
            color: 'var(--og-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          depth
        </span>
      </div>
    </div>
  );
}
