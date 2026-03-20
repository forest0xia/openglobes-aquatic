import { useState, useCallback, useRef, useContext } from 'react';
import { Globe, FilterPanel, useSpatialIndex } from '@openglobes/core';
import type { PointItem } from '@openglobes/core';
import { ThemeContext } from '../themes';
import { FishDetail } from './FishDetail';

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

  const handleFilterChange = useCallback((key: string, value: unknown) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const displayPoints = spatial.isClusterZoom ? [] : spatial.points;

  return (
    <div
      className="relative w-screen h-screen overflow-hidden"
      style={{ background: 'var(--color-og-void)' }}
    >
      {/* Globe */}
      <Globe
        theme={theme.globeTheme}
        points={displayPoints}
        onPointClick={setSelectedPoint}
        onCameraChange={handleCameraChange}
      />

      {/* Filter toggle (mobile) */}
      <button
        onClick={() => setFiltersOpen(!filtersOpen)}
        className="og-glass fixed top-4 left-4 z-20 px-4 py-2 text-sm md:hidden"
        style={{
          fontFamily: 'var(--font-body)',
          color: 'var(--color-og-text)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          fontSize: '11px',
        }}
      >
        {filtersOpen ? 'Close' : 'Filters'}
      </button>

      {/* Filter panel — desktop: left sidebar 320px, mobile: bottom sheet */}
      <div
        className={`og-glass fixed z-10
          md:top-4 md:left-4 md:w-80 md:translate-x-0
          md:animate-[slideInLeft_400ms_cubic-bezier(0.16,1,0.3,1)_forwards]
          bottom-0 left-0 right-0 md:bottom-auto md:right-auto
          rounded-t-[var(--og-radius-xl)] md:rounded-[var(--og-radius-lg)]
          md:max-h-[calc(100vh-2rem)]
          transition-transform
          ${filtersOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
        `}
        style={{ '--og-transition-normal': '250ms cubic-bezier(0.16, 1, 0.3, 1)' } as React.CSSProperties}
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div
            className="rounded-full"
            style={{
              width: 40,
              height: 4,
              background: 'var(--color-og-text-tertiary)',
            }}
          />
        </div>

        <div className="p-5 overflow-y-auto max-h-[60vh] md:max-h-[calc(100vh-3rem)]">
          <h2
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              color: 'var(--color-og-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: 16,
            }}
          >
            Filters
          </h2>
          <FilterPanel theme={theme.globeTheme} values={filterValues} onChange={handleFilterChange} />

          {/* Species count */}
          <div
            className="mt-4 pt-4"
            style={{
              borderTop: '1px solid var(--color-og-border)',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--color-og-text-secondary)',
            }}
          >
            {spatial.points.length > 0
              ? `${spatial.points.length.toLocaleString()} species in view`
              : spatial.isClusterZoom
                ? 'Zoom in to see species'
                : 'Loading\u2026'}
          </div>
        </div>
      </div>

      {/* Species detail drawer */}
      {selectedPoint && (
        <FishDetail point={selectedPoint} onClose={() => setSelectedPoint(null)} />
      )}

      {/* Attribution — bottom center */}
      <div
        className="og-glass fixed bottom-3 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 flex gap-4"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '11px',
          color: 'var(--color-og-text-tertiary)',
          borderRadius: 'var(--og-radius-sm)',
        }}
      >
        {theme.globeTheme.attribution.map((a) => (
          <a
            key={a.name}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ transition: 'color var(--og-transition-fast)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-og-text-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-og-text-tertiary)')}
          >
            {a.name} ({a.license})
          </a>
        ))}
      </div>

      {/* Loading indicator */}
      {spatial.loading && (
        <div
          className="og-glass fixed top-4 right-4 z-20 px-4 py-2"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--color-og-accent)',
            borderRadius: 'var(--og-radius-sm)',
          }}
        >
          Loading tiles\u2026
        </div>
      )}
    </div>
  );
}
