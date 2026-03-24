import type { MigrationRoute } from '../data/migrations';

const TYPE_COLORS: Record<string, string> = {
  anadromous:    '#ef476f',
  catadromous:   '#b185db',
  oceanodromous: '#4cc9f0',
  amphidromous:  '#56d6a0',
  potamodromous: '#f9c74f',
};

const TYPE_LABELS: Record<string, string> = {
  anadromous:    'Anadromous — freshwater to ocean',
  catadromous:   'Catadromous — ocean to freshwater',
  oceanodromous: 'Oceanodromous — within ocean',
  amphidromous:  'Amphidromous — both directions',
  potamodromous: 'Potamodromous — within rivers',
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface RouteDetailProps {
  route: MigrationRoute;
  onClose: () => void;
}

export function RouteDetail({ route, onClose }: RouteDetailProps) {
  const typeColor = TYPE_COLORS[route.type] ?? '#4cc9f0';
  const typeLabel = TYPE_LABELS[route.type] ?? route.type;

  return (
    <div
      id="og-route-detail"
      className="og-glass"
      style={{
        position: 'fixed',
        top: 84,
        right: 16,
        width: 280,
        zIndex: 15,
        animation: 'slideInRight 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}
    >
      <style>{`
        @media (max-width: 767px) {
          #og-route-detail {
            position: fixed !important;
            top: auto !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: auto !important;
            max-height: 70vh;
            border-radius: var(--og-radius-xl) var(--og-radius-xl) 0 0 !important;
          }
        }
      `}</style>

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 24,
          height: 24,
          borderRadius: 'var(--og-radius-sm)',
          border: 'none',
          background: 'transparent',
          color: 'var(--og-text-tertiary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          zIndex: 2,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--og-text-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--og-text-tertiary)')}
      >
        &times;
      </button>

      <div style={{ padding: '16px 20px 20px' }}>
        {/* Route name */}
        <div
          style={{
            fontFamily: 'var(--og-font-display)',
            fontSize: 18,
            fontWeight: 500,
            color: 'var(--og-text-primary)',
            letterSpacing: '-0.02em',
            paddingRight: 20,
            lineHeight: 1.3,
          }}
        >
          {route.name}
        </div>

        {/* Species */}
        <div
          style={{
            fontFamily: 'var(--og-font-body)',
            fontSize: 12,
            color: 'var(--og-text-secondary)',
            fontStyle: 'italic',
            marginTop: 4,
          }}
        >
          {route.species}
        </div>

        {/* Migration type badge */}
        <div style={{ marginTop: 10 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: 'var(--og-radius-sm)',
              background: hexToRgba(typeColor, 0.15),
              border: `1px solid ${hexToRgba(typeColor, 0.3)}`,
              color: typeColor,
              fontFamily: 'var(--og-font-body)',
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {typeLabel}
          </span>
        </div>

        {/* Description */}
        {route.description && (
          <div
            style={{
              marginTop: 14,
              fontFamily: 'var(--og-font-body)',
              fontSize: 12,
              color: 'var(--og-text-secondary)',
              lineHeight: 1.6,
            }}
          >
            {route.description}
          </div>
        )}

        {/* Route stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginTop: 14,
          }}
        >
          <div className="og-glass-inset">
            <div className="og-section-label" style={{ fontSize: 10, marginBottom: 0 }}>
              Waypoints
            </div>
            <div className="og-mono-value" style={{ marginTop: 2 }}>
              {route.waypoints.length}
            </div>
          </div>
          <div className="og-glass-inset">
            <div className="og-section-label" style={{ fontSize: 10, marginBottom: 0 }}>
              Distance
            </div>
            <div className="og-mono-value" style={{ marginTop: 2 }}>
              {estimateDistance(route.waypoints)} km
            </div>
          </div>
        </div>

        {/* Waypoints list */}
        <div style={{ marginTop: 14 }}>
          <div className="og-section-label">Route Path</div>
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {route.waypoints.map((wp, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: i < route.waypoints.length - 1
                    ? '1px solid rgba(255,255,255,0.04)'
                    : undefined,
                }}
              >
                {/* Dot and connector line */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: i === 0 || i === route.waypoints.length - 1
                        ? typeColor
                        : hexToRgba(typeColor, 0.4),
                      border: `1px solid ${hexToRgba(typeColor, 0.6)}`,
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--og-font-body)',
                      fontSize: 12,
                      color: 'var(--og-text-primary)',
                    }}
                  >
                    {wp.label || `Waypoint ${i + 1}`}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--og-font-mono)',
                      fontSize: 10,
                      color: 'var(--og-text-tertiary)',
                      marginTop: 1,
                    }}
                  >
                    {wp.lat.toFixed(2)}, {wp.lng.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Rough great-circle distance estimate in km */
function estimateDistance(waypoints: { lat: number; lng: number }[]): string {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const lat1 = waypoints[i - 1].lat * Math.PI / 180;
    const lat2 = waypoints[i].lat * Math.PI / 180;
    const dLat = lat2 - lat1;
    const dLng = (waypoints[i].lng - waypoints[i - 1].lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    total += 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total < 1000 ? Math.round(total).toString() : `${(total / 1000).toFixed(1)}k`;
}
