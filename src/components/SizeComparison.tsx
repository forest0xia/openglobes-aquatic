import { useEffect } from 'react';

interface SizeComparisonProps {
  lengthCm: number;
  speciesName: string;
  onClose: () => void;
}

const humanHeightCm = 170;

export function SizeComparison({ lengthCm, speciesName, onClose }: SizeComparisonProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // --- Scaling logic ---
  const maxDisplayCm = Math.max(humanHeightCm, lengthCm) * 1.2;
  const svgDisplayHeight = 200; // px available for figures in SVG
  const scale = svgDisplayHeight / maxDisplayCm; // px per cm

  const humanH = humanHeightCm * scale;
  const fishW = lengthCm * scale;
  const fishH = Math.max(fishW * 0.3, 4); // at least 4px tall

  // SVG viewBox: 400 wide, 280 tall
  // Figures sit on a baseline at y=230 in the SVG
  const baseline = 230;

  // Human: centred at x=80
  const humanX = 80;
  const humanTopY = baseline - humanH;

  // Head radius proportional to humanH
  const headR = Math.max(humanH * 0.07, 5);
  // Key body points (relative to top of human figure)
  const headCY = humanTopY + headR;
  const neckY  = headCY + headR;
  const shoulderY = neckY + humanH * 0.08;
  const hipY    = neckY + humanH * 0.42;
  const footY   = baseline;
  const armEndY = shoulderY + humanH * 0.22;
  const armSpan = humanH * 0.18;

  // Fish: right half, centred at x=260
  const fishX = 260;
  const fishCY = baseline - fishH / 2;
  const fishRx = fishW / 2;
  const fishRy = fishH / 2;
  // tail tip extends right of ellipse
  const tailTipX = fishX + fishRx + fishRy;
  const fishLabelX = fishX + (fishW / 2 + fishRy) / 2; // approximate center of fish+tail

  // Clamp fish right edge for very large fish so it doesn't overshoot SVG width
  const svgWidth = 400;
  const fishRightEdge = fishX + fishRx + fishRy;
  const isTruncated = fishRightEdge > svgWidth - 10;

  // Scale bar: 1m = 100cm
  const oneMeter = 100 * scale;
  const scaleBarY = 260;
  const scaleBarStartX = 20;
  // Show up to 3m or the max of human/fish rounded up
  const maxMeters = Math.ceil(maxDisplayCm / 100);
  const displayMeters = Math.min(maxMeters, 3);
  const scaleBarWidth = displayMeters * oneMeter;

  const labelFontSize = 9;

  return (
    <>
      <style>{`
        @keyframes og-size-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes og-panel-rise {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes og-fish-appear {
          from { opacity: 0; transform: scaleX(0); transform-origin: left center; }
          to   { opacity: 1; transform: scaleX(1); transform-origin: left center; }
        }
        .og-size-fish-group {
          animation: og-fish-appear 500ms cubic-bezier(0.16,1,0.3,1) 150ms both;
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          background: 'rgba(5, 10, 20, 0.75)',
          backdropFilter: 'blur(4px)',
          animation: 'og-size-fade-in 300ms ease forwards',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Panel — stop propagation so clicking inside doesn't close */}
        <div
          className="og-glass"
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: 500,
            width: 'calc(100vw - 32px)',
            padding: 24,
            animation: 'og-panel-rise 350ms cubic-bezier(0.16,1,0.3,1) forwards',
            position: 'relative',
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close size comparison"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--og-text-secondary)',
              opacity: 0.6,
              fontSize: 18,
              lineHeight: 1,
              padding: '2px 6px',
            }}
          >
            ✕
          </button>

          {/* Title */}
          <div
            className="og-section-label"
            style={{ marginBottom: 16, fontSize: 11 }}
          >
            Size Comparison
          </div>

          {/* SVG */}
          <svg
            viewBox={`0 0 ${svgWidth} 280`}
            width="100%"
            style={{ display: 'block', overflow: 'visible' }}
            aria-label={`Size comparison: ${speciesName} (${lengthCm} cm) vs human (170 cm)`}
          >
            {/* Subtle grid */}
            <defs>
              <pattern id="og-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path
                  d="M 20 0 L 0 0 0 20"
                  fill="none"
                  stroke="rgba(100,160,255,0.04)"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect width={svgWidth} height="280" fill="url(#og-grid)" />

            {/* Baseline */}
            <line
              x1="10"
              y1={baseline}
              x2={svgWidth - 10}
              y2={baseline}
              stroke="rgba(100,160,255,0.18)"
              strokeWidth="1"
            />

            {/* ── Human silhouette ── */}
            <g
              stroke="rgba(180,210,255,0.75)"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            >
              {/* Head */}
              <circle
                cx={humanX}
                cy={headCY}
                r={headR}
                fill="rgba(180,210,255,0.12)"
              />
              {/* Torso */}
              <line x1={humanX} y1={neckY} x2={humanX} y2={hipY} />
              {/* Arms */}
              <line x1={humanX} y1={shoulderY} x2={humanX - armSpan} y2={armEndY} />
              <line x1={humanX} y1={shoulderY} x2={humanX + armSpan} y2={armEndY} />
              {/* Legs */}
              <line x1={humanX} y1={hipY} x2={humanX - armSpan * 0.8} y2={footY} />
              <line x1={humanX} y1={hipY} x2={humanX + armSpan * 0.8} y2={footY} />
            </g>
            {/* Human label */}
            <text
              x={humanX}
              y={baseline + 14}
              textAnchor="middle"
              fontFamily="var(--og-font-mono, monospace)"
              fontSize={labelFontSize}
              fill="rgba(180,210,255,0.55)"
            >
              Human (170 cm)
            </text>

            {/* ── Fish silhouette ── */}
            <g
              className="og-size-fish-group"
              fill="var(--og-accent, #0096c7)"
              fillOpacity="0.28"
              stroke="var(--og-accent, #0096c7)"
              strokeOpacity="0.85"
              strokeWidth="1.5"
            >
              {/* Body ellipse */}
              <ellipse
                cx={fishX}
                cy={fishCY}
                rx={fishRx}
                ry={fishRy}
              />
              {/* Tail fin */}
              <polygon
                points={[
                  `${fishX + fishRx},${fishCY}`,
                  `${Math.min(tailTipX, svgWidth - 8)},${fishCY - fishRy * 0.9}`,
                  `${Math.min(tailTipX, svgWidth - 8)},${fishCY + fishRy * 0.9}`,
                ].join(' ')}
              />
              {/* Dorsal fin */}
              <polygon
                points={[
                  `${fishX - fishRx * 0.25},${fishCY - fishRy}`,
                  `${fishX + fishRx * 0.25},${fishCY - fishRy}`,
                  `${fishX},${fishCY - fishRy * 2}`,
                ].join(' ')}
              />
              {/* Eye */}
              <circle
                cx={fishX - fishRx * 0.5}
                cy={fishCY - fishRy * 0.15}
                r={Math.max(fishRy * 0.18, 1.5)}
                fill="var(--og-accent, #0096c7)"
                fillOpacity="0.9"
                strokeWidth="0"
              />
            </g>

            {/* Truncation ellipsis for very large fish */}
            {isTruncated && (
              <text
                x={svgWidth - 16}
                y={fishCY + 4}
                fontFamily="var(--og-font-mono, monospace)"
                fontSize={13}
                fill="var(--og-accent, #0096c7)"
                fillOpacity="0.75"
                textAnchor="middle"
              >
                …
              </text>
            )}

            {/* Fish label */}
            <text
              x={Math.min(fishLabelX, svgWidth - 60)}
              y={baseline + 14}
              textAnchor="middle"
              fontFamily="var(--og-font-mono, monospace)"
              fontSize={labelFontSize}
              fill="var(--og-accent, #0096c7)"
              fillOpacity="0.75"
            >
              {speciesName.length > 18 ? speciesName.slice(0, 17) + '…' : speciesName} ({lengthCm} cm)
            </text>

            {/* ── Scale bar ── */}
            <g stroke="rgba(100,160,255,0.35)" strokeWidth="1" fill="none">
              <line
                x1={scaleBarStartX}
                y1={scaleBarY}
                x2={scaleBarStartX + scaleBarWidth}
                y2={scaleBarY}
              />
              {/* Ticks */}
              {Array.from({ length: displayMeters + 1 }, (_, i) => (
                <line
                  key={i}
                  x1={scaleBarStartX + i * oneMeter}
                  y1={scaleBarY - 4}
                  x2={scaleBarStartX + i * oneMeter}
                  y2={scaleBarY + 4}
                />
              ))}
            </g>
            {/* Scale bar labels */}
            {Array.from({ length: displayMeters + 1 }, (_, i) => (
              <text
                key={i}
                x={scaleBarStartX + i * oneMeter}
                y={scaleBarY + 14}
                textAnchor="middle"
                fontFamily="var(--og-font-mono, monospace)"
                fontSize={8}
                fill="rgba(100,160,255,0.4)"
              >
                {i}m
              </text>
            ))}
          </svg>
        </div>
      </div>
    </>
  );
}
