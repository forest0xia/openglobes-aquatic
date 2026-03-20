interface DepthStripProps {
  depthMin: number; // meters (e.g. 150)
  depthMax: number; // meters (e.g. 700)
}

const ZONES = [
  { name: 'Sunlight', min: 0, max: 200, color: '#1a4a7a', pct: 30, icon: '☀️' },
  { name: 'Twilight', min: 200, max: 1000, color: '#0d2847', pct: 30, icon: '🌙' },
  { name: 'Midnight', min: 1000, max: 4000, color: '#06152e', pct: 20, icon: '🌑' },
  { name: 'Abyss', min: 4000, max: 6000, color: '#030a18', pct: 12, icon: '⬛' },
  { name: 'Hadal', min: 6000, max: 11000, color: '#010408', pct: 8, icon: '🕳️' },
];

const TOTAL_DEPTH = 11000; // logical max depth for position calculations

// Convert a depth value to a percentage position within the strip (0-100%)
function depthToPercent(depth: number): number {
  let accumulated = 0;
  for (const zone of ZONES) {
    const zoneDepthSpan = zone.max - zone.min;
    const depthInZone = Math.max(0, Math.min(depth, zone.max) - zone.min);
    const fraction = depthInZone / zoneDepthSpan;
    if (depth <= zone.max) {
      return accumulated + fraction * zone.pct;
    }
    accumulated += zone.pct;
  }
  return 100;
}

export function DepthStrip({ depthMin, depthMax }: DepthStripProps) {
  const topPct = depthToPercent(depthMin);
  const bottomPct = depthToPercent(depthMax);

  return (
    <div
      style={{
        borderRadius: 'var(--og-radius-md)',
        overflow: 'hidden',
        border: '1px solid var(--og-border)',
        width: '100%',
        position: 'relative',
      }}
    >
      {ZONES.map((zone) => {
        // Check overlap between fish range and this zone
        const overlapMin = Math.max(depthMin, zone.min);
        const overlapMax = Math.min(depthMax, zone.max);
        const hasOverlap = overlapMax > overlapMin;

        return (
          <div
            key={zone.name}
            style={{
              height: `${zone.pct * 1.2}px`, // 1.2px per pct = 120px total
              background: hasOverlap
                ? blendBrighter(zone.color, 0.12)
                : zone.color,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid rgba(100,160,255,0.04)',
            }}
          >
            {/* Accent highlight bar on left edge when zone is in range */}
            {hasOverlap && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  background: 'var(--og-accent)',
                  boxShadow: '0 0 6px var(--og-accent)',
                }}
              />
            )}

            {/* Zone label on the right */}
            <div
              style={{
                position: 'absolute',
                right: 8,
                fontFamily: 'var(--og-font-body)',
                fontSize: 9,
                color: hasOverlap
                  ? 'var(--og-text-secondary)'
                  : 'var(--og-text-tertiary)',
                opacity: hasOverlap ? 0.85 : 0.5,
                userSelect: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <span style={{ fontSize: 8 }}>{zone.icon}</span>
              {zone.name}
            </div>
          </div>
        );
      })}

      {/* Depth range overlay — positioned absolutely over all zones */}
      <div
        style={{
          position: 'absolute',
          top: `${topPct * 1.2}px`,
          height: `${(bottomPct - topPct) * 1.2}px`,
          left: 0,
          right: 0,
          pointerEvents: 'none',
        }}
      >
        {/* Top depth label */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 8,
            fontFamily: 'var(--og-font-mono)',
            fontSize: 10,
            color: 'var(--og-accent)',
            lineHeight: 1,
            transform: 'translateY(-50%)',
            background: 'rgba(0,0,0,0.5)',
            padding: '1px 4px',
            borderRadius: 3,
          }}
        >
          {depthMin}m
        </div>

        {/* Fish icon at midpoint */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 14,
            filter: 'drop-shadow(0 0 4px var(--og-accent))',
          }}
        >
          🐟
        </div>

        {/* Bottom depth label */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 8,
            fontFamily: 'var(--og-font-mono)',
            fontSize: 10,
            color: 'var(--og-accent)',
            lineHeight: 1,
            transform: 'translateY(50%)',
            background: 'rgba(0,0,0,0.5)',
            padding: '1px 4px',
            borderRadius: 3,
          }}
        >
          {depthMax}m
        </div>
      </div>
    </div>
  );
}

/**
 * Blend a hex color toward white by the given amount (0-1).
 * Used to make highlighted zones appear slightly brighter.
 */
function blendBrighter(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.round(r + (255 - r) * amount);
  const ng = Math.round(g + (255 - g) * amount);
  const nb = Math.round(b + (255 - b) * amount);
  return `rgb(${nr},${ng},${nb})`;
}
