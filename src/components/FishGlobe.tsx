import { useState, useCallback, useRef, useContext, useEffect, useMemo } from 'react';
import { Globe, FilterPanel, useSpatialIndex } from '@openglobes/core';
import type { PointItem, GlobeSceneRefs } from '@openglobes/core';
import { ThemeContext } from '../themes';
import { FishDetail } from './FishDetail';
import SearchBar from './SearchBar';
import { ZoomControls } from './ZoomControls';
// ThemeToggle removed — Night Mode chip added to Overlays section instead
import { DepthEffect } from './DepthEffect';
import { SwimmingFishManager } from './SwimmingFish';
import { FishNearMe } from './FishNearMe';
import { DiscoverButton } from './DiscoverButton';
import { flyTo } from '../utils/flyTo';
import { MIGRATION_ARCS } from '../data/migrations';
import { OCEAN_CURRENTS, CURRENTS_DEFAULT_VISIBLE } from '../data/currents';

// Rarity legend config
const RARITY_ITEMS = [
  { key: 'common',    label: 'Common',    color: 'var(--og-rarity-common)',    hex: '#48bfe6', glow: false },
  { key: 'uncommon',  label: 'Uncommon',  color: 'var(--og-rarity-uncommon)',  hex: '#56d6a0', glow: false },
  { key: 'rare',      label: 'Rare',      color: 'var(--og-rarity-rare)',      hex: '#f9c74f', glow: true  },
  { key: 'legendary', label: 'Legendary', color: 'var(--og-rarity-legendary)', hex: '#ef476f', glow: true  },
];

export function FishGlobe() {
  const { theme, setThemeId } = useContext(ThemeContext);
  const isNightMode = theme.id === 'bioluminescence';
  const [filterValues, setFilterValues] = useState<Record<string, unknown>>({});
  const [selectedPoint, setSelectedPoint] = useState<PointItem | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showMigrations, setShowMigrations] = useState(true);
  const [showCurrents, setShowCurrents] = useState(CURRENTS_DEFAULT_VISIBLE);
  const [depthEffect, setDepthEffect] = useState<number | null>(null);
  const [activeMonth, setActiveMonth] = useState<number | null>(null);

  // ── Scene refs for flyTo ─────────────────────────────────────────
  const sceneRefsRef = useRef<GlobeSceneRefs | null>(null);

  // ── Swimming fish sprites ─────────────────────────────────────────
  const fishManagerRef = useRef<SwimmingFishManager | null>(null);

  const handleSceneReady = useCallback((refs: GlobeSceneRefs) => {
    sceneRefsRef.current = refs;
    fishManagerRef.current = new SwimmingFishManager(refs.scene, refs.getCoords);
  }, []);

  const handleFrame = useCallback((dt: number) => {
    fishManagerRef.current?.update(dt);
  }, []);

  // Clean up fish sprites on unmount
  useEffect(() => {
    return () => {
      fishManagerRef.current?.dispose();
      fishManagerRef.current = null;
    };
  }, []);
  // ── end swimming fish sprites ─────────────────────────────────────

  // ── flyTo handler for FishNearMe ────────────────────────────────
  const handleFlyTo = useCallback((lat: number, lng: number) => {
    if (sceneRefsRef.current) flyTo(sceneRefsRef.current, lat, lng);
  }, []);

  // ── Discover handler — fly to a rare fish + select it ──────────
  const handleDiscover = useCallback((point: PointItem) => {
    if (sceneRefsRef.current) flyTo(sceneRefsRef.current, point.lat, point.lng, { duration: 2500 });
    setTimeout(() => setSelectedPoint(point), 1500);
  }, []);

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

  // ── Depth effect — fetch species depth when a point is selected ──
  useEffect(() => {
    if (!selectedPoint) { setDepthEffect(null); return; }
    fetch(`/data/species/${selectedPoint.id}.json`)
      .then((r) => r.json())
      .then((data) => {
        const depthStr = data?.metadata?.depth;
        if (depthStr) {
          const match = depthStr.match(/(\d+)/g);
          const maxDepth = match ? parseInt(match[match.length - 1]) : 0;
          if (maxDepth > 200) setDepthEffect(maxDepth);
        }
      })
      .catch(() => {});
  }, [selectedPoint?.id]);

  // ── Client-side filtering (memoized to avoid unnecessary re-renders) ──
  const displayPoints = useMemo(() => {
    return (spatial.isClusterZoom ? [] : spatial.points).filter(
      (p) => {
        // Water type filter: if any chips are selected, point must match one
        const wt = filterValues.waterType;
        if (Array.isArray(wt) && wt.length > 0) {
          if (!wt.includes((p as Record<string, unknown>).waterType)) return false;
        }
        // Rarity filter: if any selected, point must match
        const rar = filterValues.rarity;
        if (Array.isArray(rar) && rar.length > 0) {
          const RARITY_MAP: Record<number, string> = { 0: 'Common', 1: 'Uncommon', 2: 'Rare', 3: 'Legendary' };
          const pointRarityLabel = RARITY_MAP[(p.rarity as number) ?? 0] ?? 'Common';
          if (!rar.includes(pointRarityLabel)) return false;
        }
        return true;
      },
    );
  }, [spatial.isClusterZoom, spatial.points, filterValues.waterType, filterValues.rarity]);

  // ── Update swimming fish when visible points change ──────────────
  useEffect(() => {
    fishManagerRef.current?.updatePoints(displayPoints);
  }, [displayPoints]);

  // Pass only waterType + depth to FilterPanel; render rarity as custom legend
  const coreFilters = theme.globeTheme.filters.filter((f) => f.key !== 'rarity' && f.key !== 'depth');
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
        arcs={showMigrations ? MIGRATION_ARCS : []}
        trails={showCurrents ? OCEAN_CURRENTS : []}
        onPointClick={setSelectedPoint}
        onCameraChange={handleCameraChange}
        onSceneReady={handleSceneReady}
        onFrame={handleFrame}
      />

      {/* ── Search bar — top-center ──────────────────────────────────── */}
      <SearchBar totalSpecies={4677} />

      {/* Theme toggle removed — Night Mode is in Overlays section */}

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
              {spatial.isClusterZoom
                ? 'Zoom in to filter'
                : `${displayPoints.length.toLocaleString()} / ${spatial.points.length.toLocaleString()}`}
            </span>
          </div>

          {/* Water type + depth via FilterPanel */}
          <FilterPanel
            theme={coreTheme}
            values={filterValues}
            onChange={handleFilterChange}
          />

          {/* Rarity filter — clickable dots */}
          <div style={{ marginTop: 16 }}>
            <div className="og-section-label">Rarity</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {RARITY_ITEMS.map((r) => {
                const selected = Array.isArray(filterValues.rarity) ? filterValues.rarity as string[] : [];
                const isActive = selected.length === 0 || selected.includes(r.label);
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => {
                      const prev = Array.isArray(filterValues.rarity) ? filterValues.rarity as string[] : [];
                      const next = prev.includes(r.label)
                        ? prev.filter((s: string) => s !== r.label)
                        : [...prev, r.label];
                      handleFilterChange('rarity', next);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'none',
                      border: 'none',
                      padding: '2px 0',
                      cursor: 'pointer',
                      opacity: isActive ? 1 : 0.35,
                      transition: 'opacity var(--og-transition-fast)',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: r.color,
                        boxShadow: r.glow ? `0 0 4px ${r.hex}4d` : undefined,
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
                  </button>
                );
              })}
            </div>
          </div>

          {/* Overlays section */}
          <div style={{ marginTop: 16 }}>
            <div className="og-section-label">Overlays</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`og-chip${showMigrations ? ' og-chip--active' : ''}`}
                aria-pressed={showMigrations}
                onClick={() => setShowMigrations((v) => !v)}
              >
                Migration Routes
              </button>
              <button
                type="button"
                className={`og-chip${showCurrents ? ' og-chip--active' : ''}`}
                aria-pressed={showCurrents}
                onClick={() => setShowCurrents((v) => !v)}
              >
                Ocean Currents
              </button>
              <button
                type="button"
                className={`og-chip${isNightMode ? ' og-chip--active' : ''}`}
                aria-pressed={isNightMode}
                onClick={() => setThemeId(isNightMode ? 'fish' : 'bioluminescence')}
              >
                Night Mode
              </button>
            </div>
          </div>

          {/* Season section */}
          <div style={{ marginTop: 16 }}>
            <div className="og-section-label">Season</div>
            <input
              type="range"
              min={1}
              max={12}
              value={activeMonth ?? 1}
              onChange={(e) => setActiveMonth(parseInt(e.target.value))}
              className="og-range"
              style={{ width: '100%', accentColor: 'var(--og-accent)' }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 4,
              }}
            >
              <span
                className="og-mono-sm"
                style={{ fontSize: 11, color: activeMonth ? 'var(--og-text-primary)' : 'var(--og-text-tertiary)' }}
              >
                {activeMonth
                  ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][activeMonth - 1]
                  : 'All months'}
              </span>
              {activeMonth !== null && (
                <button
                  type="button"
                  onClick={() => setActiveMonth(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--og-font-body)',
                    fontSize: 10,
                    color: 'var(--og-accent)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: 0,
                  }}
                >
                  Reset
                </button>
              )}
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
              {spatial.isClusterZoom
                ? 'Zoom in to filter'
                : `${displayPoints.length.toLocaleString()} / ${spatial.points.length.toLocaleString()}`}
            </span>
          </div>

          <FilterPanel
            theme={coreTheme}
            values={filterValues}
            onChange={handleFilterChange}
          />

          {/* Rarity filter — clickable dots */}
          <div style={{ marginTop: 16 }}>
            <div className="og-section-label">Rarity</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {RARITY_ITEMS.map((r) => {
                const selected = Array.isArray(filterValues.rarity) ? filterValues.rarity as string[] : [];
                const isActive = selected.length === 0 || selected.includes(r.label);
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => {
                      const prev = Array.isArray(filterValues.rarity) ? filterValues.rarity as string[] : [];
                      const next = prev.includes(r.label)
                        ? prev.filter((s: string) => s !== r.label)
                        : [...prev, r.label];
                      handleFilterChange('rarity', next);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'none',
                      border: 'none',
                      padding: '2px 0',
                      cursor: 'pointer',
                      opacity: isActive ? 1 : 0.35,
                      transition: 'opacity var(--og-transition-fast)',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: r.color,
                        boxShadow: r.glow ? `0 0 4px ${r.hex}4d` : undefined,
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
                  </button>
                );
              })}
            </div>
          </div>

          {/* Overlays section (mobile) */}
          <div style={{ marginTop: 16 }}>
            <div className="og-section-label">Overlays</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`og-chip${showMigrations ? ' og-chip--active' : ''}`}
                aria-pressed={showMigrations}
                onClick={() => setShowMigrations((v) => !v)}
              >
                Migration Routes
              </button>
              <button
                type="button"
                className={`og-chip${showCurrents ? ' og-chip--active' : ''}`}
                aria-pressed={showCurrents}
                onClick={() => setShowCurrents((v) => !v)}
              >
                Ocean Currents
              </button>
              <button
                type="button"
                className={`og-chip${isNightMode ? ' og-chip--active' : ''}`}
                aria-pressed={isNightMode}
                onClick={() => setThemeId(isNightMode ? 'fish' : 'bioluminescence')}
              >
                Night Mode
              </button>
            </div>
          </div>

          {/* Season section (mobile) */}
          <div style={{ marginTop: 16 }}>
            <div className="og-section-label">Season</div>
            <input
              type="range"
              min={1}
              max={12}
              value={activeMonth ?? 1}
              onChange={(e) => setActiveMonth(parseInt(e.target.value))}
              className="og-range"
              style={{ width: '100%', accentColor: 'var(--og-accent)' }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 4,
              }}
            >
              <span
                className="og-mono-sm"
                style={{ fontSize: 11, color: activeMonth ? 'var(--og-text-primary)' : 'var(--og-text-tertiary)' }}
              >
                {activeMonth
                  ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][activeMonth - 1]
                  : 'All months'}
              </span>
              {activeMonth !== null && (
                <button
                  type="button"
                  onClick={() => setActiveMonth(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--og-font-body)',
                    fontSize: 10,
                    color: 'var(--og-accent)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: 0,
                  }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Species detail drawer ────────────────────────────────────── */}
      {selectedPoint && (
        <FishDetail point={selectedPoint} onClose={() => setSelectedPoint(null)} />
      )}

      {/* ── Depth effect overlay ──────────────────────────────────────── */}
      {depthEffect !== null && (
        <DepthEffect depth={depthEffect} onComplete={() => setDepthEffect(null)} />
      )}

      {/* ── Zoom controls — bottom-right ─────────────────────────────── */}
      <ZoomControls
        onZoomIn={() => {
          const canvas = document.querySelector('#og-app canvas');
          if (canvas) canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, bubbles: true }));
        }}
        onZoomOut={() => {
          const canvas = document.querySelector('#og-app canvas');
          if (canvas) canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true }));
        }}
      />

      {/* ── Discover rare fish — bottom-right, above zoom ──────────── */}
      <DiscoverButton points={spatial.points} onDiscover={handleDiscover} />

      {/* ── Fish Near Me — bottom-left ─────────────────────────────── */}
      <FishNearMe points={spatial.points} onFlyTo={handleFlyTo} />

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
