import { useState, useCallback, useRef, useContext, useEffect, useMemo } from 'react';
import { Globe, FilterPanel, useSpatialIndex } from '@openglobes/core';
import type { PointItem, GlobeSceneRefs } from '@openglobes/core';
import { ThemeContext } from '../themes';
import { FishDetail } from './FishDetail';
import SearchBar from './SearchBar';
import { ZoomControls } from './ZoomControls';
// ThemeToggle removed — Night Mode chip added to Overlays section instead
// DepthEffect removed — user found it distracting
import { GeoLabelsManager } from './GeoLabels';
import { FishNearMe } from './FishNearMe';
import { DiscoverButton } from './DiscoverButton';
import { ListPanel } from './ListPanel';
import { flyTo } from '../utils/flyTo';
import { MIGRATION_ARCS } from '../data/migrations';
import { OCEAN_CURRENTS, CURRENTS_DEFAULT_VISIBLE } from '../data/currents';
import { GEO_LABELS } from '../data/geoLabels';

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
  // depthEffect removed
  const [activeMonth, setActiveMonth] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [detailDismissed, setDetailDismissed] = useState(false);
  const [labelTypes, setLabelTypes] = useState<string[]>(['ocean', 'sea', 'continent', 'island']);
  const [listPanel, setListPanel] = useState<{ title: string; items: { id: string; name: string; extra?: string }[] } | null>(null);

  // ── Scene refs for flyTo ─────────────────────────────────────────
  const sceneRefsRef = useRef<GlobeSceneRefs | null>(null);

  // ── Geographic labels ─────────────────────────────────────────────
  const labelsManagerRef = useRef<GeoLabelsManager | null>(null);

  const handleSceneReady = useCallback((refs: GlobeSceneRefs) => {
    sceneRefsRef.current = refs;
    labelsManagerRef.current = new GeoLabelsManager(refs.scene, refs.getCoords, GEO_LABELS);
  }, []);

  const frameCount = useRef(0);
  const handleFrame = useCallback((dt: number) => {
    frameCount.current++;
    if (frameCount.current % 10 === 0 && sceneRefsRef.current) {
      labelsManagerRef.current?.update(sceneRefsRef.current.camera);
    }
  }, []);

  // Clean up geo labels on unmount
  useEffect(() => {
    return () => {
      labelsManagerRef.current?.dispose();
      labelsManagerRef.current = null;
    };
  }, []);

  // ── Reset detailDismissed when a new point is selected ───────────
  useEffect(() => {
    if (selectedPoint) setDetailDismissed(false);
  }, [selectedPoint]);

  // ── Sync labels visibility with labelTypes state ──────────────────
  useEffect(() => {
    if (!labelsManagerRef.current) return;
    const anyVisible = labelTypes.length > 0;
    labelsManagerRef.current.setVisible(anyVisible);
    for (const type of ['ocean', 'sea', 'continent', 'island']) {
      labelsManagerRef.current.setTypeVisible(type, labelTypes.includes(type));
    }
  }, [labelTypes]);

  // ── flyTo handler for FishNearMe ────────────────────────────────
  const handleFlyTo = useCallback((lat: number, lng: number) => {
    if (sceneRefsRef.current) flyTo(sceneRefsRef.current, lat, lng);
  }, []);

  // ── Discover handler — fly to a rare fish + select it ──────────
  const handleDiscover = useCallback((point: PointItem) => {
    if (sceneRefsRef.current) flyTo(sceneRefsRef.current, point.lat, point.lng, { duration: 2500 });
    setTimeout(() => setSelectedPoint(point), 1500);
  }, []);

  // ── Migration species list for ListPanel ───────────────────────
  const migrationSpecies = useMemo(() => {
    const unique = new Map<string, { name: string; legs: number }>();
    for (const arc of MIGRATION_ARCS) {
      if (arc.label) {
        const existing = unique.get(arc.label);
        if (existing) {
          existing.legs++;
        } else {
          unique.set(arc.label, { name: arc.label, legs: 1 });
        }
      }
    }
    return Array.from(unique.values()).map(({ name, legs }) => ({
      id: name,
      name,
      extra: `${legs} leg${legs > 1 ? 's' : ''} route`,
    }));
  }, []);

  const spatial = useSpatialIndex({
    tileBaseUrl: '/data',
    tileManifestUrl: '/tile-manifest.json',
    minZoom: 0,
    maxZoom: 6,
    filters: filterValues,
  });

  // ── Camera throttle ─────────────────────────────────────────────────
  // The animation loop fires handleCameraChange every frame (~60fps).
  // useSpatialIndex internally debounces at 150ms, so we must NOT
  // only use a trailing setTimeout (it gets perpetually reset by
  // the next frame and never fires). Instead: call immediately when
  // camera moves significantly, PLUS a trailing call for settling.
  const updateCameraRef = useRef(spatial.updateCamera);
  updateCameraRef.current = spatial.updateCamera;
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCamRef = useRef({ dist: 0, lat: 0, lng: 0 });

  const handleCameraChange = useCallback(
    (distance: number) => {
      const cam = sceneRefsRef.current?.camera;
      let centerLat = 0;
      let centerLng = 0;
      if (cam) {
        const { x, y, z } = cam.position;
        const r = Math.sqrt(x * x + y * y + z * z);
        centerLat = Math.asin(y / r) * (180 / Math.PI);
        centerLng = Math.atan2(x, z) * (180 / Math.PI);
      }

      const halfArc = Math.asin(Math.min(1, 100 / distance)) * (180 / Math.PI);
      const bounds = {
        north: Math.min(85, centerLat + halfArc),
        south: Math.max(-85, centerLat - halfArc),
        east: Math.min(180, centerLng + halfArc),
        west: Math.max(-180, centerLng - halfArc),
      };

      // Check if camera moved enough to warrant an immediate call
      const prev = lastCamRef.current;
      const moved = prev.dist === 0
        || Math.abs(distance - prev.dist) > 0.5
        || Math.abs(centerLat - prev.lat) > 0.3
        || Math.abs(centerLng - prev.lng) > 0.3;

      if (moved) {
        lastCamRef.current = { dist: distance, lat: centerLat, lng: centerLng };
        // Immediate call — useSpatialIndex debounces internally
        updateCameraRef.current(distance, bounds);
      }

      // Trailing call to catch the final position after rotation stops
      if (throttleRef.current) clearTimeout(throttleRef.current);
      throttleRef.current = setTimeout(() => {
        updateCameraRef.current(distance, bounds);
      }, 250);
    },
    [],
  );
  // ── end camera throttle fix ──────────────────────────────────────────

  const handleFilterChange = useCallback((key: string, value: unknown) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Depth effect removed — user found it distracting

  // ── Convert clusters to renderable pseudo-points at low zoom ──────
  const clusterPoints = useMemo((): PointItem[] => {
    if (!spatial.isClusterZoom || spatial.clusters.length === 0) return [];
    return spatial.clusters.map((c, i) => ({
      id: `cluster-${i}`,
      lat: c.lat,
      lng: c.lng,
      name: `${c.count.toLocaleString()} species`,
      rarity: c.count > 500 ? 3 : c.count > 100 ? 2 : c.count > 20 ? 1 : 0,
      _isCluster: true,
      _count: c.count,
      _topItems: c.topItems,
    } as PointItem));
  }, [spatial.isClusterZoom, spatial.clusters]);

  // ── Client-side filtering (memoized) ────────────────────────────
  const filteredPoints = useMemo(() => {
    return spatial.points.filter((p) => {
      const wt = filterValues.waterType;
      if (Array.isArray(wt) && wt.length > 0) {
        if (!wt.includes((p as Record<string, unknown>).waterType)) return false;
      }
      const rar = filterValues.rarity;
      if (Array.isArray(rar) && rar.length > 0) {
        const RARITY_MAP: Record<number, string> = { 0: 'Common', 1: 'Uncommon', 2: 'Rare', 3: 'Legendary' };
        const pointRarityLabel = RARITY_MAP[(p.rarity as number) ?? 0] ?? 'Common';
        if (!rar.includes(pointRarityLabel)) return false;
      }
      return true;
    });
  }, [spatial.points, filterValues.waterType, filterValues.rarity]);

  // ── Persistent points ref for Discover / NearMe (survives cluster zoom) ──
  const allPointsRef = useRef<PointItem[]>([]);
  useEffect(() => {
    if (spatial.points.length > 0) {
      allPointsRef.current = spatial.points;
    }
  }, [spatial.points]);

  // Show clusters at low zoom, filtered points at high zoom
  const displayPoints = spatial.isClusterZoom ? clusterPoints : filteredPoints;

  // ── Aggregate species count across all zoom levels ──────────────
  const totalSpeciesCount = useMemo(() => {
    if (spatial.isClusterZoom && spatial.clusters.length > 0) {
      return spatial.clusters.reduce((sum, c) => sum + c.count, 0);
    }
    return filteredPoints.length;
  }, [spatial.isClusterZoom, spatial.clusters, filteredPoints]);

  // ── Clear rarity filter when entering cluster zoom ─────────────
  useEffect(() => {
    if (spatial.isClusterZoom && Array.isArray(filterValues.rarity) && (filterValues.rarity as string[]).length > 0) {
      setFilterValues(prev => ({ ...prev, rarity: [] }));
    }
  }, [spatial.isClusterZoom]);

  // ── Handle point/cluster clicks ────────────────────────────────
  const handlePointClick = useCallback((point: PointItem) => {
    // If it's a cluster, show species list AND zoom in
    if ((point as Record<string, unknown>)._isCluster) {
      const topItems = ((point as Record<string, unknown>)._topItems as { id: string; name: string }[]) ?? [];
      const count = (point as Record<string, unknown>)._count as number;
      setListPanel({
        title: `${count.toLocaleString()} species`,
        items: topItems.map(t => ({ id: t.id, name: t.name, extra: 'Tap to view' })),
      });
      // Also zoom in
      if (sceneRefsRef.current) {
        flyTo(sceneRefsRef.current, point.lat, point.lng, { duration: 1500 });
      }
      return;
    }
    setSelectedPoint(point);
  }, []);

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
        arcConfig={{ elevation: 0.01 }}
        trails={showCurrents ? OCEAN_CURRENTS : []}
        onPointClick={handlePointClick}
        onCameraChange={handleCameraChange}
        onSceneReady={handleSceneReady}
        onFrame={handleFrame}
      />

      {/* ── Search bar — top-center ──────────────────────────────────── */}
      <SearchBar totalSpecies={totalSpeciesCount || 4677} />

      {/* Theme toggle removed — Night Mode is in Overlays section */}

      {/* ── Panel controls — top-left, below search bar ──────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 52,
          left: 16,
          zIndex: 15,
          display: 'flex',
          gap: 4,
        }}
        className="hidden md:flex"
      >
        <button
          type="button"
          className={`og-chip${showFilters ? ' og-chip--active' : ''}`}
          onClick={() => setShowFilters(v => !v)}
          style={{ fontSize: 10, height: 26, padding: '0 10px' }}
        >
          Filters
        </button>
        <button
          type="button"
          className={`og-chip${selectedPoint && !detailDismissed ? ' og-chip--active' : ''}`}
          onClick={() => {
            if (selectedPoint) setDetailDismissed(v => !v);
          }}
          style={{ fontSize: 10, height: 26, padding: '0 10px', opacity: selectedPoint ? 1 : 0.4 }}
        >
          Detail
        </button>
      </div>

      {/* ── Filter panel — desktop: left sidebar / mobile: bottom sheet ─ */}
      {/* Desktop */}
      {showFilters && (
      <div
        id="og-filters"
        className="og-glass hidden md:block"
        style={{
          position: 'absolute',
          top: 84,
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
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <span className="og-mono-sm" style={{ color: 'var(--og-accent)' }}>
              {totalSpeciesCount.toLocaleString()} species in view
            </span>
          </div>

          {/* Water type + depth via FilterPanel */}
          <FilterPanel
            theme={coreTheme}
            values={filterValues}
            onChange={handleFilterChange}
          />

          {/* Rarity filter — clickable dots */}
          <div style={{ marginTop: 16, opacity: spatial.isClusterZoom ? 0.3 : 1, pointerEvents: spatial.isClusterZoom ? 'none' : 'auto' }}>
            <div className="og-section-label">
              Rarity {spatial.isClusterZoom && <span style={{ fontSize: 9, opacity: 0.6 }}>(zoom in)</span>}
            </div>
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
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className={`og-chip${showMigrations ? ' og-chip--active' : ''}`}
                aria-pressed={showMigrations}
                onClick={() => setShowMigrations((v) => !v)}
              >
                Migration Routes
              </button>
              {showMigrations && (
                <button
                  type="button"
                  onClick={() => setListPanel({ title: 'Migration Routes', items: migrationSpecies })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--og-text-tertiary)', fontSize: 12, padding: '0 4px' }}
                  aria-label="Migration species info"
                >
                  &#8505;
                </button>
              )}
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
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { label: 'Spring', months: [3,4,5] },
                { label: 'Summer', months: [6,7,8] },
                { label: 'Fall', months: [9,10,11] },
                { label: 'Winter', months: [12,1,2] },
              ].map(s => {
                const isActive = activeMonth !== null && s.months.includes(activeMonth);
                return (
                  <button
                    key={s.label}
                    type="button"
                    className={`og-chip${isActive ? ' og-chip--active' : ''}`}
                    onClick={() => setActiveMonth(isActive ? null : s.months[1])}
                    style={{ fontSize: 11 }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Labels section */}
          <div style={{ marginTop: 16 }}>
            <div className="og-section-label">Labels</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { type: 'ocean', label: 'Oceans' },
                { type: 'sea', label: 'Seas' },
                { type: 'continent', label: 'Land' },
                { type: 'island', label: 'Islands' },
              ].map(lt => (
                <button
                  key={lt.type}
                  type="button"
                  className={`og-chip${labelTypes.includes(lt.type) ? ' og-chip--active' : ''}`}
                  onClick={() => {
                    setLabelTypes(prev =>
                      prev.includes(lt.type)
                        ? prev.filter(t => t !== lt.type)
                        : [...prev, lt.type]
                    );
                  }}
                  style={{ fontSize: 11 }}
                >
                  {lt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}

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
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <span className="og-mono-sm" style={{ color: 'var(--og-accent)' }}>
              {totalSpeciesCount.toLocaleString()} species in view
            </span>
          </div>

          <FilterPanel
            theme={coreTheme}
            values={filterValues}
            onChange={handleFilterChange}
          />

          {/* Rarity filter — clickable dots */}
          <div style={{ marginTop: 16, opacity: spatial.isClusterZoom ? 0.3 : 1, pointerEvents: spatial.isClusterZoom ? 'none' : 'auto' }}>
            <div className="og-section-label">
              Rarity {spatial.isClusterZoom && <span style={{ fontSize: 9, opacity: 0.6 }}>(zoom in)</span>}
            </div>
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
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className={`og-chip${showMigrations ? ' og-chip--active' : ''}`}
                aria-pressed={showMigrations}
                onClick={() => setShowMigrations((v) => !v)}
              >
                Migration Routes
              </button>
              {showMigrations && (
                <button
                  type="button"
                  onClick={() => setListPanel({ title: 'Migration Routes', items: migrationSpecies })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--og-text-tertiary)', fontSize: 12, padding: '0 4px' }}
                  aria-label="Migration species info"
                >
                  &#8505;
                </button>
              )}
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
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { label: 'Spring', months: [3,4,5] },
                { label: 'Summer', months: [6,7,8] },
                { label: 'Fall', months: [9,10,11] },
                { label: 'Winter', months: [12,1,2] },
              ].map(s => {
                const isActive = activeMonth !== null && s.months.includes(activeMonth);
                return (
                  <button
                    key={s.label}
                    type="button"
                    className={`og-chip${isActive ? ' og-chip--active' : ''}`}
                    onClick={() => setActiveMonth(isActive ? null : s.months[1])}
                    style={{ fontSize: 11 }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Labels section (mobile) */}
          <div style={{ marginTop: 16 }}>
            <div className="og-section-label">Labels</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { type: 'ocean', label: 'Oceans' },
                { type: 'sea', label: 'Seas' },
                { type: 'continent', label: 'Land' },
                { type: 'island', label: 'Islands' },
              ].map(lt => (
                <button
                  key={lt.type}
                  type="button"
                  className={`og-chip${labelTypes.includes(lt.type) ? ' og-chip--active' : ''}`}
                  onClick={() => {
                    setLabelTypes(prev =>
                      prev.includes(lt.type)
                        ? prev.filter(t => t !== lt.type)
                        : [...prev, lt.type]
                    );
                  }}
                  style={{ fontSize: 11 }}
                >
                  {lt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Species detail drawer ────────────────────────────────────── */}
      {selectedPoint && !detailDismissed && (
        <FishDetail point={selectedPoint} onClose={() => setSelectedPoint(null)} />
      )}

      {/* Depth effect overlay removed */}

      {/* ── List panel (cluster species / migration routes) ───────── */}
      {listPanel && (
        <ListPanel
          title={listPanel.title}
          items={listPanel.items}
          onClose={() => setListPanel(null)}
          onItemClick={(id) => {
            // Try exact ID match first, then name match
            const found = allPointsRef.current.find(p => p.id === id)
              || allPointsRef.current.find(p =>
                p.name.toLowerCase().includes(id.toLowerCase())
                || id.toLowerCase().includes(p.name.toLowerCase())
              );
            if (found) {
              setSelectedPoint(found);
              setListPanel(null);
              if (sceneRefsRef.current) {
                flyTo(sceneRefsRef.current, found.lat, found.lng, { duration: 1500 });
              }
            }
          }}
        />
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
      <DiscoverButton points={allPointsRef.current} onDiscover={handleDiscover} />

      {/* ── Fish Near Me — bottom-left ─────────────────────────────── */}
      <FishNearMe points={allPointsRef.current} onFlyTo={handleFlyTo} />

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
