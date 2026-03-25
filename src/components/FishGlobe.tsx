import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { Globe, FilterPanel } from '@openglobes/core';
import type { PointItem } from '@openglobes/core';
import SearchBar from './SearchBar';
import { ZoomControls } from './ZoomControls';
import { FishNearMe } from './FishNearMe';
import { DiscoverButton } from './DiscoverButton';

const FishDetail = lazy(() => import('./FishDetail').then(m => ({ default: m.FishDetail })));
const RouteDetail = lazy(() => import('./RouteDetail').then(m => ({ default: m.RouteDetail })));
const ListPanel = lazy(() => import('./ListPanel').then(m => ({ default: m.ListPanel })));
import { flyTo } from '../utils/flyTo';
import { useGlobeControls } from '../hooks/useGlobeControls';
import { useFilters } from '../hooks/useFilters';
import { useMigrationRoutes } from '../hooks/useMigrationRoutes';
import { BODY_GROUP_COLORS } from '../sprites/SpriteLoader';

export function FishGlobe() {
  const globe = useGlobeControls();
  const filters = useFilters(globe.setUpdateCamera, globe.syncSpriteLayers);
  const migration = useMigrationRoutes(globe.sceneRefsRef);

  const [selectedPoint, setSelectedPoint] = useState<PointItem | null>(null);
  const [detailDismissed, setDetailDismissed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [listPanel, setListPanel] = useState<{
    title: string;
    items: { id: string; name: string; extra?: string }[];
  } | null>(null);

  // ── Only one right-side panel at a time ─────────────────────────
  const clearRightPanels = useCallback(() => {
    setSelectedPoint(null);
    setDetailDismissed(false);
    setListPanel(null);
    migration.setSelectedRouteId(null);
  }, [migration]);

  // Reset detailDismissed when a new point is selected
  useEffect(() => {
    if (selectedPoint) setDetailDismissed(false);
  }, [selectedPoint]);

  // When route hover opens detail, close other panels
  useEffect(() => {
    if (migration.selectedRoute) {
      setSelectedPoint(null);
      setListPanel(null);
    }
  }, [migration.selectedRoute]);

  // ── Handlers ────────────────────────────────────────────────────

  const handleDiscover = useCallback(
    (point: PointItem) => {
      if (globe.sceneRefsRef.current)
        flyTo(globe.sceneRefsRef.current, point.lat, point.lng, { duration: 2500 });
      setTimeout(() => {
        clearRightPanels();
        setSelectedPoint(point);
      }, 1500);
    },
    [globe.sceneRefsRef, clearRightPanels],
  );

  const handleArcClick = useCallback(
    (label: string) => {
      clearRightPanels();
      migration.handleArcClick(label);
    },
    [migration, clearRightPanels],
  );

  const handleRouteSelect = useCallback(
    (routeId: string) => {
      clearRightPanels();
      migration.handleRouteSelect(routeId);
    },
    [migration, clearRightPanels],
  );

  const handlePointClick = useCallback(
    (point: PointItem) => {
      if ((point as Record<string, unknown>)._isCluster) {
        const topItems =
          ((point as Record<string, unknown>)._topItems as { id: string; name: string }[]) ?? [];
        const count = (point as Record<string, unknown>)._count as number;
        const seen = new Set<string>();
        const unique = topItems.filter((t) => {
          if (seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });
        clearRightPanels();
        setListPanel({
          title: `${count.toLocaleString()} species`,
          items: unique.map((t) => ({ id: t.id, name: t.name, extra: 'Tap to view' })),
        });
        if (globe.sceneRefsRef.current) {
          flyTo(globe.sceneRefsRef.current, point.lat, point.lng, {
            duration: 2000,
            zoomDistance: 180,
          });
        }
        return;
      }
      clearRightPanels();
      setSelectedPoint(point);
    },
    [globe.sceneRefsRef, clearRightPanels],
  );

  const handleListItemClick = useCallback(
    (id: string) => {
      const route = migration.migrationRoutes.find((r) => r.id === id || r.name === id);
      if (route) {
        handleRouteSelect(route.id);
        return;
      }
      const found =
        filters.allPointsRef.current.find((p) => p.id === id) ||
        filters.allPointsRef.current.find(
          (p) =>
            p.name.toLowerCase().includes(id.toLowerCase()) ||
            id.toLowerCase().includes(p.name.toLowerCase()),
        );
      if (found) {
        clearRightPanels();
        setSelectedPoint(found);
        if (globe.sceneRefsRef.current) {
          flyTo(globe.sceneRefsRef.current, found.lat, found.lng, { duration: 1500 });
        }
      }
    },
    [migration.migrationRoutes, handleRouteSelect, filters.allPointsRef, globe.sceneRefsRef, clearRightPanels],
  );

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div
      id="og-app"
      onPointerMove={migration.handleRouteHover}
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
        key={globe.globeSkin}
        theme={globe.coreTheme}
        points={filters.displayPoints}
        trails={migration.memoTrails}
        onPointClick={handlePointClick}
        onArcClick={handleArcClick}
        onCameraChange={globe.handleCameraChange}
        onSceneReady={globe.handleSceneReady}
        onFrame={globe.handleFrame}
      />

      {/* ── Search bar ──────────────────────────────────────────────── */}
      <SearchBar
        totalSpecies={filters.totalSpeciesCount || 4677}
        onSelect={(point) => {
          setSelectedPoint(point);
          setListPanel(null);
          if (globe.sceneRefsRef.current) {
            flyTo(globe.sceneRefsRef.current, point.lat, point.lng, {
              duration: 1500,
              zoomDistance: 130,
            });
          }
        }}
      />

      {/* ── Panel toggle chips (desktop) ────────────────────────────── */}
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
          onClick={() => setShowFilters((v) => !v)}
          style={{ fontSize: 10, height: 26, padding: '0 10px' }}
        >
          Filters
        </button>
        <button
          type="button"
          className={`og-chip${selectedPoint && !detailDismissed ? ' og-chip--active' : ''}`}
          onClick={() => {
            if (selectedPoint) setDetailDismissed((v) => !v);
          }}
          style={{
            fontSize: 10,
            height: 26,
            padding: '0 10px',
            opacity: selectedPoint ? 1 : 0.4,
          }}
        >
          Detail
        </button>
        <button
          type="button"
          className={`og-chip${migration.showMigrations ? ' og-chip--active' : ''}`}
          onClick={() => {
            if (migration.showMigrations && migration.migrationRoutes.length > 0) {
              setSelectedPoint(null);
              setListPanel({
                title: `${migration.migrationRoutes.length} Migration Routes`,
                items: migration.migrationRouteItems,
              });
            }
          }}
          style={{ fontSize: 10, height: 26, padding: '0 10px' }}
        >
          Routes
        </button>
      </div>

      {/* ── Filter panel (desktop) ──────────────────────────────────── */}
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <span className="og-mono-sm" style={{ color: 'var(--og-accent)' }}>
                {filters.totalSpeciesCount.toLocaleString()} species in view
              </span>
            </div>

            <FilterPanel
              theme={globe.coreTheme}
              values={filters.filterValues}
              onChange={filters.handleFilterChange}
            />

            {/* Animal type */}
            <div style={{ marginTop: 16 }}>
              <div className="og-section-label">Animal Type</div>
              <BodyGroupChips
                filterValues={filters.filterValues}
                onChange={filters.handleFilterChange}
              />
            </div>

            {/* Overlays */}
            <div style={{ marginTop: 16 }}>
              <div className="og-section-label">Overlays</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <OverlayChips migration={migration} globe={globe} />
              </div>
            </div>

            {/* Season */}
            <div style={{ marginTop: 16 }}>
              <div className="og-section-label">Season</div>
              <SeasonChips
                activeMonth={filters.activeMonth}
                setActiveMonth={filters.setActiveMonth}
              />
            </div>

            {/* Labels */}
            <div style={{ marginTop: 16 }}>
              <div className="og-section-label">Labels</div>
              <LabelChips
                labelTypes={globe.labelTypes}
                setLabelTypes={globe.setLabelTypes}
              />
            </div>

            {/* Globe skin */}
            <div style={{ marginTop: 16 }}>
              <div className="og-section-label">Globe Skin</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(globe.GLOBE_SKINS).map(([key, { label }]) => (
                  <button
                    key={key}
                    type="button"
                    className={`og-chip${globe.globeSkin === key ? ' og-chip--active' : ''}`}
                    onClick={() => globe.setGlobeSkin(key)}
                    style={{ fontSize: 11 }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile filter toggle ────────────────────────────────────── */}
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

      {/* ── Mobile filter panel (bottom sheet) ──────────────────────── */}
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
        <div
          style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}
        >
          <span className="og-drag-handle" />
        </div>

        <div style={{ padding: '12px 16px 24px', overflowY: 'auto', maxHeight: '60vh' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <span className="og-mono-sm" style={{ color: 'var(--og-accent)' }}>
              {filters.totalSpeciesCount.toLocaleString()} species in view
            </span>
          </div>

          <FilterPanel
            theme={globe.coreTheme}
            values={filters.filterValues}
            onChange={filters.handleFilterChange}
          />

          <div style={{ marginTop: 16 }}>
            <div className="og-section-label">Overlays</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <OverlayChips migration={migration} globe={globe} />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="og-section-label">Season</div>
            <SeasonChips
              activeMonth={filters.activeMonth}
              setActiveMonth={filters.setActiveMonth}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="og-section-label">Labels</div>
            <LabelChips
              labelTypes={globe.labelTypes}
              setLabelTypes={globe.setLabelTypes}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="og-section-label">Globe Skin</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(globe.GLOBE_SKINS).map(([key, { label }]) => (
                <button
                  key={key}
                  type="button"
                  className={`og-chip${globe.globeSkin === key ? ' og-chip--active' : ''}`}
                  onClick={() => globe.setGlobeSkin(key)}
                  style={{ fontSize: 11 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Species detail ──────────────────────────────────────────── */}
      {selectedPoint && !detailDismissed && (
        <Suspense fallback={null}>
          <FishDetail point={selectedPoint} onClose={() => setSelectedPoint(null)} />
        </Suspense>
      )}

      {/* ── Route detail ────────────────────────────────────────────── */}
      {migration.selectedRoute && (
        <Suspense fallback={null}>
          <RouteDetail
            route={migration.selectedRoute}
            onClose={() => migration.setSelectedRouteId(null)}
          />
        </Suspense>
      )}

      {/* ── List panel ──────────────────────────────────────────────── */}
      {listPanel && (
        <Suspense fallback={null}>
          <ListPanel
            title={listPanel.title}
            items={listPanel.items}
            onClose={() => {
              setListPanel(null);
              migration.setSelectedRouteId(null);
            }}
            onItemClick={handleListItemClick}
          />
        </Suspense>
      )}

      {/* ── Zoom controls ───────────────────────────────────────────── */}
      <ZoomControls
        onZoomIn={() => {
          const canvas = document.querySelector('#og-app canvas');
          if (canvas)
            canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, bubbles: true }));
        }}
        onZoomOut={() => {
          const canvas = document.querySelector('#og-app canvas');
          if (canvas)
            canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true }));
        }}
      />

      {/* ── Discover / Near Me ──────────────────────────────────────── */}
      <DiscoverButton points={filters.allPointsRef.current} onDiscover={handleDiscover} />
      <FishNearMe points={filters.allPointsRef.current} onFlyTo={globe.handleFlyTo} />

      {/* ── Attribution ─────────────────────────────────────────────── */}
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
          Data: FishBase + SeaLifeBase (CC-BY-NC) + GBIF
        </span>
      </div>

      {/* ── Loading indicator ───────────────────────────────────────── */}
      {filters.spatial.loading && (
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
          Loading tiles&hellip;
        </div>
      )}

      {/* ── Route hover tooltip ─────────────────────────────────────── */}
      {migration.routeTooltip && (
        <div
          className="og-glass"
          onClick={() => {
            handleRouteSelect(migration.routeTooltip!.route.id);
            migration.setRouteTooltip(null);
          }}
          style={{
            position: 'fixed',
            left: migration.routeTooltip.x + 12,
            top: migration.routeTooltip.y - 10,
            zIndex: 30,
            padding: '8px 12px',
            cursor: 'pointer',
            maxWidth: 250,
            borderRadius: 'var(--og-radius-sm)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--og-font-body)',
              fontSize: 12,
              color: 'var(--og-text-primary)',
              fontWeight: 500,
            }}
          >
            {migration.routeTooltip.route.name}
          </div>
          <div
            style={{
              fontFamily: 'var(--og-font-mono)',
              fontSize: 10,
              color: 'var(--og-text-tertiary)',
              marginTop: 2,
            }}
          >
            {migration.routeTooltip.route.species} &middot; {migration.routeTooltip.route.type}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Extracted sub-components to reduce duplication ───────────────────

function OverlayChips({
  migration,
  globe,
}: {
  migration: ReturnType<typeof useMigrationRoutes>;
  globe: ReturnType<typeof useGlobeControls>;
}) {
  return (
    <>
      <button
        type="button"
        className={`og-chip${migration.showMigrations ? ' og-chip--active' : ''}`}
        aria-pressed={migration.showMigrations}
        onClick={() => migration.setShowMigrations((v) => !v)}
      >
        Migration Routes
      </button>
      {migration.showMigrations && migration.migrationRoutes.length > 0 && (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}
        >
          <input
            type="range"
            min={1}
            max={migration.migrationRoutes.length}
            value={migration.maxMigrationRoutes || migration.migrationRoutes.length}
            onChange={(e) => migration.setMaxMigrationRoutes(parseInt(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--og-accent)' }}
          />
          <span className="og-mono-sm" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
            {migration.maxMigrationRoutes || migration.migrationRoutes.length}/
            {migration.migrationRoutes.length}
          </span>
        </div>
      )}
      <button
        type="button"
        className={`og-chip${migration.showCurrents ? ' og-chip--active' : ''}`}
        aria-pressed={migration.showCurrents}
        onClick={() => migration.setShowCurrents((v) => !v)}
      >
        Ocean Currents
      </button>
      <button
        type="button"
        className={`og-chip${globe.isNightMode ? ' og-chip--active' : ''}`}
        aria-pressed={globe.isNightMode}
        onClick={() => globe.setThemeId(globe.isNightMode ? 'fish' : 'bioluminescence')}
      >
        Night Mode
      </button>
    </>
  );
}

function SeasonChips({
  activeMonth,
  setActiveMonth,
}: {
  activeMonth: number | null;
  setActiveMonth: (m: number | null) => void;
}) {
  const seasons = [
    { label: 'Spring', months: [3, 4, 5] },
    { label: 'Summer', months: [6, 7, 8] },
    { label: 'Fall', months: [9, 10, 11] },
    { label: 'Winter', months: [12, 1, 2] },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {seasons.map((s) => {
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
  );
}

function LabelChips({
  labelTypes,
  setLabelTypes,
}: {
  labelTypes: string[];
  setLabelTypes: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const types = [
    { type: 'ocean', label: 'Oceans' },
    { type: 'sea', label: 'Seas' },
    { type: 'continent', label: 'Land' },
    { type: 'island', label: 'Islands' },
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {types.map((lt) => (
        <button
          key={lt.type}
          type="button"
          className={`og-chip${labelTypes.includes(lt.type) ? ' og-chip--active' : ''}`}
          onClick={() =>
            setLabelTypes((prev) =>
              prev.includes(lt.type)
                ? prev.filter((t) => t !== lt.type)
                : [...prev, lt.type],
            )
          }
          style={{ fontSize: 11 }}
        >
          {lt.label}
        </button>
      ))}
    </div>
  );
}

const BODY_GROUP_CHIPS = [
  { key: 'fish', label: 'Fish' },
  { key: 'mammal', label: 'Mammals' },
  { key: 'reptile', label: 'Reptiles' },
  { key: 'cephalopod', label: 'Cephalopods' },
  { key: 'cnidarian', label: 'Cnidarians' },
  { key: 'crustacean', label: 'Crustaceans' },
  { key: 'echinoderm', label: 'Echinoderms' },
  { key: 'mollusk', label: 'Mollusks' },
];

function BodyGroupChips({
  filterValues,
  onChange,
}: {
  filterValues: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const selected = (filterValues.bodyGroup as string[]) ?? [];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {BODY_GROUP_CHIPS.map((bg) => {
        const isActive = selected.includes(bg.key);
        const color = BODY_GROUP_COLORS[bg.key];
        return (
          <button
            key={bg.key}
            type="button"
            className={`og-chip${isActive ? ' og-chip--active' : ''}`}
            onClick={() => {
              const next = isActive
                ? selected.filter((k) => k !== bg.key)
                : [...selected, bg.key];
              onChange('bodyGroup', next.length > 0 ? next : undefined);
            }}
            style={{
              fontSize: 11,
              borderColor: isActive ? color : undefined,
              color: isActive ? color : undefined,
            }}
          >
            {bg.label}
          </button>
        );
      })}
    </div>
  );
}
