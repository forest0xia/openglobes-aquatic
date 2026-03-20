import { useState, useEffect, useRef, useCallback } from 'react';
import type { PointItem } from '@openglobes/core';

interface DiscoverButtonProps {
  points: PointItem[];
  onDiscover: (point: PointItem) => void;
}

export function DiscoverButton({ points, onDiscover }: DiscoverButtonProps) {
  const [autoPlay, setAutoPlay] = useState(false);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const discoverRandom = useCallback(() => {
    const rarePoints = points.filter((p) => (p.rarity ?? 0) >= 2);
    if (rarePoints.length === 0) return;
    const pick = rarePoints[Math.floor(Math.random() * rarePoints.length)];
    onDiscover(pick);
  }, [points, onDiscover]);

  // Auto-play interval
  useEffect(() => {
    if (autoPlay && points.length > 0) {
      discoverRandom();
      autoPlayRef.current = setInterval(discoverRandom, 10000);
    }
    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
        autoPlayRef.current = null;
      }
    };
  }, [autoPlay, points, discoverRandom]);

  // Stop auto-play on globe interaction
  useEffect(() => {
    if (!autoPlay) return;
    const canvas = document.querySelector('#og-app canvas');
    if (!canvas) return;
    const stop = () => setAutoPlay(false);
    canvas.addEventListener('pointerdown', stop, { once: true });
    return () => canvas.removeEventListener('pointerdown', stop);
  }, [autoPlay]);

  // Long-press handling
  const handlePointerDown = useCallback(() => {
    longPressFiredRef.current = false;
    longPressRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setAutoPlay((prev) => !prev);
    }, 1000);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  // Click: single-click discovers, unless long-press already fired
  const handleClick = useCallback(() => {
    if (longPressFiredRef.current) return;
    if (autoPlay) {
      setAutoPlay(false);
      return;
    }
    discoverRandom();
  }, [autoPlay, discoverRandom]);

  // Double-click toggles auto-play
  const handleDoubleClick = useCallback(() => {
    setAutoPlay((prev) => !prev);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        right: 72,
        zIndex: 20,
      }}
    >
      <button
        type="button"
        className="og-glass"
        title="Discover a rare fish"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        style={{
          width: 44,
          height: 44,
          borderRadius: 'var(--og-radius-md)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--og-text-secondary)',
          transition: 'color var(--og-transition-fast), box-shadow var(--og-transition-fast)',
          position: 'relative',
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
        </svg>
      </button>

      {/* Auto-play indicator */}
      {autoPlay && (
        <div
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'rgba(0, 0, 0, 0.6)',
            borderRadius: 'var(--og-radius-sm)',
            padding: '2px 6px',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--og-accent)',
              animation: 'discoverPulse 1.5s ease-in-out infinite',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--og-font-mono)',
              fontSize: 9,
              color: 'var(--og-text-secondary)',
              whiteSpace: 'nowrap',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Auto
          </span>
        </div>
      )}

      <style>{`
        @keyframes discoverPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
