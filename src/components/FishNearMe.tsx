import { useState, useCallback, useEffect, useRef } from 'react';
import type { PointItem } from '../types';

interface FishNearMeProps {
  points: PointItem[];
  onFlyTo: (lat: number, lng: number) => void;
}

type Status = 'idle' | 'locating' | 'result' | 'error';

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Location pin SVG icon (16px). */
function PinIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--og-text-secondary)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export function FishNearMe({ points, onFlyTo }: FishNearMeProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [nearCount, setNearCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear auto-dismiss timer on unmount
  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    setStatus('idle');
    setNearCount(0);
    setCopied(false);
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    if (status === 'result') {
      dismiss();
      return;
    }

    if (!navigator.geolocation) {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
      return;
    }

    setStatus('locating');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;

        // Fly the globe to the user's location
        onFlyTo(userLat, userLng);

        // Count species within 500 km
        const count = points.filter(
          (p) => haversineKm(userLat, userLng, p.lat, p.lng) <= 500,
        ).length;

        setNearCount(count);
        setStatus('result');

        // Auto-dismiss after 8 seconds
        dismissTimer.current = setTimeout(() => {
          setStatus('idle');
          setNearCount(0);
          setCopied(false);
        }, 8000);
      },
      () => {
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }, [status, points, onFlyTo, dismiss]);

  const handleShare = useCallback(() => {
    const text = `I just discovered ${nearCount} fish species live near me! \u{1F41F} fish.openglobes.com`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [nearCount]);

  const buttonLabel =
    status === 'locating'
      ? 'Locating...'
      : status === 'error'
        ? 'Location denied'
        : 'Near Me';

  return (
    <>
      {/* ── Trigger button ─────────────────────────────────────────── */}
      <button
        type="button"
        className="og-glass"
        onClick={handleClick}
        disabled={status === 'locating'}
        style={{
          position: 'fixed',
          bottom: 80,
          left: 16,
          zIndex: 20,
          height: 40,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          border: 'none',
          cursor: status === 'locating' ? 'wait' : 'pointer',
          fontFamily: 'var(--og-font-body)',
          fontSize: 12,
          color: 'var(--og-text-secondary)',
          background: 'transparent',
        }}
      >
        <PinIcon />
        {buttonLabel}
      </button>

      {/* ── Results badge overlay ──────────────────────────────────── */}
      {status === 'result' && (
        <div
          className="og-glass"
          onClick={dismiss}
          role="status"
          style={{
            position: 'fixed',
            bottom: 130,
            left: 16,
            width: 240,
            zIndex: 20,
            padding: '14px 16px',
            cursor: 'pointer',
            animation: 'fadeIn 300ms ease-out forwards',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--og-font-display)',
              fontSize: 15,
              color: 'var(--og-text-primary)',
              marginBottom: 6,
            }}
          >
            {'\u{1F41F}'} {nearCount} species near you!
          </div>

          <div
            className="og-mono-sm"
            style={{
              color: 'var(--og-text-tertiary)',
              marginBottom: 10,
              fontSize: 11,
            }}
          >
            Within 500 km of your location
          </div>

          <button
            type="button"
            className="og-chip og-chip--active"
            onClick={(e) => {
              e.stopPropagation();
              handleShare();
            }}
            style={{
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>
      )}
    </>
  );
}
