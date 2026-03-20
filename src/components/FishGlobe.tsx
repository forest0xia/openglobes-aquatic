import { useState, useCallback, useRef, useContext } from 'react';
import { Globe, FilterPanel, useSpatialIndex } from '@openglobes/core';
import type { PointItem } from '@openglobes/core';
import { ThemeContext } from '../themes';
import { FishDetail } from './FishDetail';
import SearchBar from './SearchBar';
import { ZoomControls } from './ZoomControls';
import { ThemeToggle } from './ThemeToggle';

// Rarity legend config
const RARITY_ITEMS = [
  { key: 'common',    label: 'Common',    color: 'var(--og-rarity-common)',    hex: '#48bfe6', glow: false },
  { key: 'uncommon',  label: 'Uncommon',  color: 'var(--og-rarity-uncommon)',  hex: '#56d6a0', glow: false },
  { key: 'rare',      label: 'Rare',      color: 'var(--og-rarity-rare)',      hex: '#f9c74f', glow: true  },
  { key: 'legendary', label: 'Legendary', color: 'var(--og-rarity-legendary)', hex: '#ef476f', glow: true  },
];

export function FishGlobe() {
  const { theme } = useContext(ThemeContext);
  const [filterValues, setFilterValues] = useState<Record<string, unknown>>({});
  const [selectedPoint, setSelectedPoint] = useState<PointItem | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const spatial = useSpatialIndex({
    tileBaseUrl: '/data',
    minZoom: 0,
    maxZoom: 6,
    filters: filterValues,
  });

  // ── Camera throttle fix ──────────────────────────────────────────────
  // Keep this block EXACTLY as-is. The trailing setTimeout ensures tiles
  // load after the animation loop settles (debounce-bug workaround).
  const updateCameraRef = useRef(spatial.updateCamera);
  updateCameraRef.current = spatial.updateCamera;
  const lastDistRef = useRef(0);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCameraChange = useCallback(
    (distance: number) => {
      const distChanged = Math.abs(distance - lastDistRef.current) > 0.5;
      if (distChanged || lastDistRef.current === 0) {
        lastDistRef.current = distance;
        const halfArc = Math.asin(Math.min(1, 100 / distance)) * (180 / Math.PI);
        const bounds = {
          north: Math.min(85, halfArc),
          south: Math.max(-85, -halfArc),
          east: Math.min(180, halfArc),
          west: Math.max(-180, -halfArc),
        };
        updateCameraRef.current(distance, bounds);

        if (throttleRef.current) clearTimeout(throttleRef.current);
        throttleRef.current = setTimeout(() => {
          updateCameraRef.current(distance, bounds);
        }, 200);
      }
    },
    [],
  );
  // ── end camera throttle fix ──────────────────────────────────────────

  const handleFilterChange = useCallback((key: string, value: unknown) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const displayPoints = spatial.isClusterZoom ? [] : spatial.points;

  // Pass only waterType + depth to FilterPanel; render rarity as custom legend
  const coreFilters = theme.globeTheme.filters.filter((f) => f.key !== 'rarity');
  const coreTheme = { ...theme.globeTheme, filters: coreFilters };

  return (
    <div
      id="og-app"
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--og-bg-void)',
      }}
    >
      {/* ── Globe ───────────────────────────────────────────────────── */}
      <Globe
        theme={theme.globeTheme}
        points={displayPoints}
        onPointClick={setSelectedPoint}
        onCameraChange={handleCameraChange}
      />

      {/* ── Search bar — top-center ──────────────────────────────────── */}
      <SearchBar totalSpecies={4677} />

      {/* ── Theme toggle — top-right ─────────────────────────────────── */}
      <ThemeToggle />

      {/* ── Filter panel — desktop: left sidebar / mobile: bottom sheet ─ */}
      {/* Desktop */}
      <div
        id="og-filters"
        className="og-glass hidden md:block"
        style={{
          position: 'absolute',
          top: 60,
          left: 16,
          width: 240,
          zIndex: 10,
          animation: 'slideInLeft 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        <div style={{ padding: '16px 16px 20px' }}>
          {/* Header row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <span className="og-section-label" style={{ marginBottom: 0 }}>
              Filters
            </span>
            <span className="og-mono-sm" style={{ color: 'var(--og-accent)' }}>
              4,677
            </span>
          </div>

          {/* Water type + depth via FilterPanel */}
          <FilterPanel
            theme={coreTheme}
            values={filterValues}
            onChange={handleFilterChange}
          />

          {/* Rarity legend */}
          <div style={{ marginTop: 16 }}>
            <div className="og-section-label">Rarity</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {RARITY_ITEMS.map((r) => (
                <div
                  key={r.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: r.color,
                      boxShadow: r.glow
                        ? `0 0 4px ${r.hex}4d`
                        : undefined,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--og-font-body)',
                      fontSize: 12,
                      color: 'var(--og-text-secondary)',
                    }}
                  >
                    {r.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile filter toggle button */}
      <button
        onClick={() => setFiltersOpen(!filtersOpen)}
        className="og-glass md:hidden"
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 20,
          padding: '8px 16px',
          fontFamily: 'var(--og-font-body)',
          color: 'var(--og-text-primary)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          fontSize: 11,
          cursor: 'pointer',
          background: 'transparent',
          border: 'none',
        }}
      >
        {filtersOpen ? 'Close' : 'Filters'}
      </button>

      {/* Mobile filter panel — bottom sheet */}
      <div
        className="og-glass md:hidden"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          borderRadius: 'var(--og-radius-xl) var(--og-radius-xl) 0 0',
          transform: filtersOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform var(--og-transition-normal)',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <span className="og-drag-handle" />
        </div>

        <div style={{ padding: '12px 16px 24px', overflowY: 'auto', maxHeight: '60vh' }}>
          {/* Header row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <span className="og-section-label" style={{ marginBottom: 0 }}>
              Filters
            </span>
            <span className="og-mono-sm" style={{ color: 'var(--og-accent)' }}>
              4,677
            </span>
          </div>

          <FilterPanel
            theme={coreTheme}
            values={filterValues}
            onChange={handleFilterChange}
          />

          {/* Rarity legend */}
          <div style={{ marginTop: 16 }}>
            <div className="og-section-label">Rarity</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {RARITY_ITEMS.map((r) => (
                <div
                  key={r.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: r.color,
                      boxShadow: r.glow
                        ? `0 0 4px ${r.hex}4d`
                        : undefined,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--og-font-body)',
                      fontSize: 12,
                      color: 'var(--og-text-secondary)',
                    }}
                  >
                    {r.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Species detail drawer ────────────────────────────────────── */}
      {selectedPoint && (
        <FishDetail point={selectedPoint} onClose={() => setSelectedPoint(null)} />
      )}

      {/* ── Zoom controls — bottom-right ─────────────────────────────── */}
      <ZoomControls />

      {/* ── Attribution — bottom-center ──────────────────────────────── */}
      <div
        id="og-attribution"
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          opacity: 0.35,
        }}
      >
        {/* Clock icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--og-text-tertiary)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4l3 3" />
        </svg>
        <span
          style={{
            fontFamily: 'var(--og-font-body)',
            fontSize: 10,
            color: 'var(--og-text-tertiary)',
            whiteSpace: 'nowrap',
          }}
        >
          Data: FishBase (CC-BY-NC) + GBIF
        </span>
      </div>

      {/* ── Loading indicator ────────────────────────────────────────── */}
      {spatial.loading && (
        <div
          className="og-glass"
          style={{
            position: 'absolute',
            top: 60,
            right: 16,
            zIndex: 20,
            padding: '6px 14px',
            fontFamily: 'var(--og-font-mono)',
            fontSize: 11,
            color: 'var(--og-accent)',
            borderRadius: 'var(--og-radius-sm)',
          }}
        >
          Loading tiles…
        </div>
      )}
    </div>
  );
}
