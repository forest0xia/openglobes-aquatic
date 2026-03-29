import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import SearchBar from './SearchBar';
import { ZoomControls } from './ZoomControls';
import { useGlobe } from '../hooks/useGlobe';
import { useSpeciesData } from '../hooks/useSpeciesData';
import type { Species } from '../hooks/useSpeciesData';
import {
  loadMigrationRoutes,
  getMigrationRoutes,
  getMigrationTrails,
  type MigrationRoute,
} from '../data/migrations';
import { OCEAN_CURRENTS, CURRENTS_DEFAULT_VISIBLE } from '../data/currents';
import { GLOBE_RADIUS } from '../globe/coordUtils';
import type { TrailData } from '../globe/TrailLayer';

const _hitPoint = new THREE.Vector3(); // reusable for route hover ray hit

// ---------------------------------------------------------------------------
// FishGlobe — main application shell.
//
// Renders a full-screen custom globe (GlobeRenderer via useGlobe hook) with
// species sprites, migration trails, search, hover tooltips, and detail panel.
// ---------------------------------------------------------------------------

export function FishGlobe() {
  const globe = useGlobe();
  const { species, hotspots, loading: dataLoading } = useSpeciesData();

  // ── Migration route state ───────────────────────────────────────────────
  const [migrationRoutes, setMigrationRoutes] = useState<MigrationRoute[]>([]);
  const [maxMigrationRoutes, setMaxMigrationRoutes] = useState(0);
  const [showMigrations, setShowMigrations] = useState(true);
  const [showCurrents, setShowCurrents] = useState(CURRENTS_DEFAULT_VISIBLE);
  // Route tooltip also managed via DOM ref (no React re-render)
  const routeTooltipRef = useRef<HTMLDivElement>(null);
  const routeTooltipActive = useRef(false);

  // Load migration routes on mount
  useEffect(() => {
    loadMigrationRoutes().then(() => {
      setMigrationRoutes(getMigrationRoutes());
    });
  }, []);

  // ── UI state ────────────────────────────────────────────────────────────
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);
  // Hover tooltip managed via ref + DOM manipulation (no React re-render)
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef<Species | null>(null);
  const [showControls, setShowControls] = useState(true);
  const hoverThrottleRef = useRef(0);

  const showTooltip = useCallback((species: Species, x: number, y: number) => {
    hoveredRef.current = species;
    const el = tooltipRef.current;
    if (!el) return;
    el.style.display = 'block';
    el.style.left = `${x + 16}px`;
    el.style.top = `${y - 12}px`;
    const name = species.nameZh || species.name;
    const sub = species.nameZh ? species.name : '';
    const desc = species.tagline.zh || species.tagline.en;
    const tierZh: Record<string, string> = { star: '明星物种', ecosystem: '生态关键', surprise: '惊喜发现' };
    el.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">
        <span style="font-family:var(--og-font-body);font-size:14px;font-weight:600;color:var(--og-text-primary)">${name}</span>
        ${sub ? `<span style="font-family:var(--og-font-mono);font-size:10px;color:var(--og-text-tertiary);font-style:italic">${sub}</span>` : ''}
      </div>
      <div style="font-family:var(--og-font-body);font-size:12px;color:var(--og-text-secondary);line-height:1.4">${desc}</div>
      <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
        <span class="og-chip" style="font-size:9px;padding:2px 6px">${tierZh[species.tier] || species.tier}</span>
        <span class="og-chip" style="font-size:9px;padding:2px 6px">${species.viewingSpots.length}个观测点</span>
      </div>`;
  }, []);

  const hideTooltip = useCallback(() => {
    hoveredRef.current = null;
    const el = tooltipRef.current;
    if (el) el.style.display = 'none';
  }, []);

  // ── Build species sprites + migration route fish once data + scene ready ──
  useEffect(() => {
    if (species.length > 0 && globe.sceneReady) {
      globe.buildSprites(species, migrationRoutes.length > 0 ? migrationRoutes : undefined);
    }
  }, [species, migrationRoutes, globe.sceneReady, globe.buildSprites]);

  // ── Build migration trails ──────────────────────────────────────────────
  // Convert core-style TrailDatum[] from migrations/currents into TrailData[]
  // that the new TrailLayer understands.
  useEffect(() => {
    if (!globe.sceneReady || !globe.renderer) return;

    const coreTrails = [
      ...(showMigrations ? getMigrationTrails(maxMigrationRoutes) : []),
      ...(showCurrents ? OCEAN_CURRENTS : []),
    ];

    // Adapt from core TrailDatum shape → TrailData shape
    const trailData: TrailData[] = coreTrails.map((t: any) => ({
      waypoints: t.waypoints as { lat: number; lng: number }[],
      color: Array.isArray(t.color) ? t.color[0] : (t.color ?? '#4cc9f0'),
      width: t.width ?? 1.5,
      speed: t.speed,
    }));

    const r = globe.renderer.getRenderer();
    const resolution = new THREE.Vector2(
      r.domElement.width,
      r.domElement.height,
    );
    globe.renderer.trailLayer.build(trailData, resolution);
  }, [
    globe.sceneReady,
    globe.renderer,
    showMigrations,
    showCurrents,
    maxMigrationRoutes,
    migrationRoutes,
  ]);

  // ── Hit testing — find species + location at cursor ─────────────────────
  const findHitAtCursor = useCallback(
    (clientX: number, clientY: number): { species: Species; lat: number; lng: number } | null => {
      if (!globe.renderer) return null;
      const r = globe.renderer.getRenderer();
      const rect = r.domElement.getBoundingClientRect();
      return globe.renderer.speciesLayer.hitTest(
        globe.renderer.getCamera(),
        clientX - rect.left,
        clientY - rect.top,
        rect.width,
        rect.height,
      );
    },
    [globe.renderer],
  );

  // ── Route hover — sphere intersection to get lat/lng ────────────────────
  const raycasterRef = useRef(new THREE.Raycaster());
  const ndcRef = useRef(new THREE.Vector2());
  const showMigrationsRef = useRef(showMigrations);
  showMigrationsRef.current = showMigrations;
  const migrationRoutesRef = useRef(migrationRoutes);
  migrationRoutesRef.current = migrationRoutes;

  const handleRouteHover = useCallback(
    (clientX: number, clientY: number) => {
      const routes = migrationRoutesRef.current;
      if (
        !globe.renderer ||
        !showMigrationsRef.current ||
        routes.length === 0
      ) {
        if (routeTooltipRef.current) routeTooltipRef.current.style.display = "none";
        return;
      }

      const camera = globe.renderer.getCamera();
      const r = globe.renderer.getRenderer();
      const rect = r.domElement.getBoundingClientRect();

      ndcRef.current.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );

      raycasterRef.current.setFromCamera(ndcRef.current, camera);

      // Intersect with a virtual sphere (the globe) instead of the actual mesh
      const origin = raycasterRef.current.ray.origin;
      const dir = raycasterRef.current.ray.direction;
      // Ray-sphere intersection: ||origin + t*dir||^2 = R^2
      const a = dir.dot(dir);
      const b = 2 * origin.dot(dir);
      const c = origin.dot(origin) - GLOBE_RADIUS * GLOBE_RADIUS;
      const discriminant = b * b - 4 * a * c;

      if (discriminant < 0) {
        if (routeTooltipRef.current) routeTooltipRef.current.style.display = "none";
        return;
      }

      const t = (-b - Math.sqrt(discriminant)) / (2 * a);
      if (t < 0) {
        if (routeTooltipRef.current) routeTooltipRef.current.style.display = "none";
        return;
      }

      const hp = _hitPoint.copy(origin).addScaledVector(dir, t);
      const rr = Math.sqrt(hp.x ** 2 + hp.y ** 2 + hp.z ** 2);
      const hitLat = Math.asin(hp.y / rr) * (180 / Math.PI);
      const hitLng = Math.atan2(hp.x, hp.z) * (180 / Math.PI);

      let bestDist = Infinity;
      let bestRoute: MigrationRoute | null = null;
      const camDist = camera.position.length();
      // Very tight threshold — only match when hovering directly on a trail line
      const threshold = Math.min(1.0, Math.max(0.3, camDist / 500));

      for (const route of routes) {
        const wps = route.waypoints;
        for (let i = 0; i < wps.length; i++) {
          const d0 = Math.sqrt(
            (wps[i].lat - hitLat) ** 2 + (wps[i].lng - hitLng) ** 2,
          );
          if (d0 < bestDist && d0 < threshold) {
            bestDist = d0;
            bestRoute = route;
          }
          if (i < wps.length - 1) {
            const ax = wps[i].lng,
              ay = wps[i].lat;
            const bx = wps[i + 1].lng,
              by = wps[i + 1].lat;
            const dx = bx - ax,
              dy = by - ay;
            const lenSq = dx * dx + dy * dy;
            if (lenSq > 0) {
              const tt = Math.max(
                0,
                Math.min(
                  1,
                  ((hitLng - ax) * dx + (hitLat - ay) * dy) / lenSq,
                ),
              );
              const projX = ax + tt * dx,
                projY = ay + tt * dy;
              const dSeg = Math.sqrt(
                (projX - hitLng) ** 2 + (projY - hitLat) ** 2,
              );
              if (dSeg < bestDist && dSeg < threshold) {
                bestDist = dSeg;
                bestRoute = route;
              }
            }
          }
        }
      }

      const el = routeTooltipRef.current;
      if (bestRoute && el) {
        routeTooltipActive.current = true;
        el.style.display = 'block';
        el.style.left = `${clientX + 12}px`;
        el.style.top = `${clientY - 10}px`;
        el.innerHTML = `
          <div style="font-family:var(--og-font-body);font-size:12px;color:var(--og-text-primary);font-weight:500">${bestRoute.name}</div>
          <div style="font-family:var(--og-font-mono);font-size:10px;color:var(--og-text-tertiary);margin-top:2px">${bestRoute.species} · ${bestRoute.type}</div>`;
      } else if (el) {
        routeTooltipActive.current = false;
        el.style.display = 'none';
      }
    },
    [globe.renderer],
  );

  // ── Pointer handlers ────────────────────────────────────────────────────
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Throttle to every 150ms and skip if pointer barely moved
      const now = Date.now();
      if (now - hoverThrottleRef.current < 150) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      if (dx * dx + dy * dy < 9) return;
      hoverThrottleRef.current = now;
      lastPointerRef.current.x = e.clientX;
      lastPointerRef.current.y = e.clientY;

      // Species hover takes priority over route hover
      const hit = findHitAtCursor(e.clientX, e.clientY);
      if (hit) {
        showTooltip(hit.species, e.clientX, e.clientY);
        if (routeTooltipRef.current) routeTooltipRef.current.style.display = 'none';
        (e.currentTarget as HTMLElement).style.cursor = 'pointer';
        if (globe.renderer) {
          const idx = globe.renderer.speciesLayer.findInstanceIndex(hit.species, hit.lat, hit.lng);
          globe.renderer.speciesLayer.setHighlight(idx);
        }
      } else {
        if (hoveredRef.current) {
          hideTooltip();
          globe.renderer?.speciesLayer.setHighlight(-1);
        }
        handleRouteHover(e.clientX, e.clientY);
        (e.currentTarget as HTMLElement).style.cursor = 'default';
      }
    },
    [findHitAtCursor, handleRouteHover, showTooltip, hideTooltip],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const hit = findHitAtCursor(e.clientX, e.clientY);
      if (hit) {
        setSelectedSpecies(hit.species);
        hideTooltip();
        // Highlight the selected instance
        if (globe.renderer) {
          const idx = globe.renderer.speciesLayer.findInstanceIndex(hit.species, hit.lat, hit.lng);
          globe.renderer.speciesLayer.setHighlight(idx);
        }
        globe.flyTo(hit.lat, hit.lng, { duration: 1500, zoomDistance: 180 });
      }
    },
    [findHitAtCursor, globe],
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      id="og-app"
      onPointerMove={handlePointerMove}
      onClick={handleClick}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--og-bg-void)',
      }}
    >
      {/* ── Globe canvas container ─────────────────────────────────────── */}
      <div
        ref={globe.containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          inset: 0,
        }}
      />

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <SearchBar
        totalSpecies={species.length || 200}
        onSelect={(point: any) => {
          const found = species.find(
            (s) =>
              s.name.toLowerCase().includes(point.name.toLowerCase()) ||
              s.nameZh === point.name,
          );
          if (found) {
            setSelectedSpecies(found);
            const spot = found.viewingSpots[0];
            if (spot) {
              globe.flyTo(spot.lat, spot.lng, {
                duration: 1500,
                zoomDistance: 130,
              });
            }
          }
        }}
      />

      {/* ── Control panel toggle ──────────────────────────────────────── */}
      <button
        type="button"
        className={`og-chip${showControls ? ' og-chip--active' : ''}`}
        onClick={() => setShowControls((v) => !v)}
        style={{
          position: 'absolute',
          top: 52,
          left: 16,
          zIndex: 15,
          fontSize: 10,
          height: 26,
          padding: '0 10px',
        }}
      >
        Controls
      </button>

      {/* ── Control panel ─────────────────────────────────────────────── */}
      {showControls && (
        <div
          className="og-glass hidden md:block"
          style={{
            position: 'absolute',
            top: 84,
            left: 16,
            width: 240,
            zIndex: 10,
            animation:
              'slideInLeft 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          <div style={{ padding: '16px 16px 20px' }}>
            {!dataLoading && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <span
                  className="og-mono-sm"
                  style={{ color: 'var(--og-accent)' }}
                >
                  {species.length} 个物种 &middot; {hotspots.length} 个热点
                </span>
              </div>
            )}

            <div>
              <div className="og-section-label">图层叠加</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`og-chip${showMigrations ? ' og-chip--active' : ''}`}
                  onClick={() => setShowMigrations((v) => !v)}
                >
                  Migration Routes
                </button>
                <button
                  type="button"
                  className={`og-chip${showCurrents ? ' og-chip--active' : ''}`}
                  onClick={() => setShowCurrents((v) => !v)}
                >
                  Ocean Currents
                </button>
                <button
                  type="button"
                  className={`og-chip${globe.isNightMode ? ' og-chip--active' : ''}`}
                  onClick={() =>
                    globe.setThemeId(
                      globe.isNightMode ? 'fish' : 'bioluminescence',
                    )
                  }
                >
                  Night Mode
                </button>
              </div>
            </div>

            {showMigrations && migrationRoutes.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <input
                  type="range"
                  min={1}
                  max={migrationRoutes.length}
                  value={maxMigrationRoutes || migrationRoutes.length}
                  onChange={(e) =>
                    setMaxMigrationRoutes(parseInt(e.target.value))
                  }
                  style={{ flex: 1, accentColor: 'var(--og-accent)' }}
                />
                <span
                  className="og-mono-sm"
                  style={{ fontSize: 10, whiteSpace: 'nowrap' }}
                >
                  {maxMigrationRoutes || migrationRoutes.length}/
                  {migrationRoutes.length}
                </span>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <div className="og-section-label">地理标签</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[['ocean','大洋'],['sea','海域'],['continent','大陆'],['island','岛屿']].map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    className={`og-chip${globe.labelTypes.includes(type) ? ' og-chip--active' : ''}`}
                    onClick={() =>
                      globe.setLabelTypes((prev) =>
                        prev.includes(type)
                          ? prev.filter((t) => t !== type)
                          : [...prev, type],
                      )
                    }
                    style={{ fontSize: 11 }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="og-section-label">地球贴图</div>
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

      {/* ── Hover tooltip (DOM-managed, no React re-render) ────────────── */}
      <div
        ref={tooltipRef}
        className="og-glass"
        style={{
          display: 'none',
          position: 'fixed',
          zIndex: 30,
          padding: '10px 14px',
          maxWidth: 280,
          borderRadius: 'var(--og-radius-md)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Species detail panel (pinned on click) ──────────────────────── */}
      {selectedSpecies && (
        <div
          className="og-glass"
          style={{
            position: 'absolute',
            top: 84,
            right: 16,
            width: 320,
            maxHeight: 'calc(100vh - 120px)',
            overflowY: 'auto',
            zIndex: 20,
            borderRadius: 'var(--og-radius-lg)',
            animation:
              'slideInLeft 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          <div style={{ padding: '20px' }}>
            {/* Close button */}
            <button
              type="button"
              onClick={() => { setSelectedSpecies(null); globe.renderer?.speciesLayer.setHighlight(-1); }}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--og-text-tertiary)',
                fontSize: 18,
                padding: '4px',
              }}
            >
              &times;
            </button>

            {/* Name */}
            <div style={{ marginBottom: 4 }}>
              <div
                style={{
                  fontFamily: 'var(--og-font-display)',
                  fontSize: 22,
                  fontWeight: 600,
                  color: 'var(--og-text-primary)',
                }}
              >
                {selectedSpecies.nameZh || selectedSpecies.name}
              </div>
              {selectedSpecies.nameZh && (
                <div
                  style={{
                    fontFamily: 'var(--og-font-mono)',
                    fontSize: 12,
                    color: 'var(--og-text-tertiary)',
                    fontStyle: 'italic',
                    marginTop: 2,
                  }}
                >
                  {selectedSpecies.scientificName}
                </div>
              )}
            </div>

            {/* Tagline — Chinese first */}
            <div style={{
              fontFamily: 'var(--og-font-body)', fontSize: 13,
              color: 'var(--og-text-secondary)', lineHeight: 1.5, marginBottom: 16,
            }}>
              {selectedSpecies.tagline.zh || selectedSpecies.tagline.en}
              {selectedSpecies.tagline.zh && selectedSpecies.tagline.en && (
                <div style={{ color: 'var(--og-text-tertiary)', marginTop: 4, fontSize: 12 }}>
                  {selectedSpecies.tagline.en}
                </div>
              )}
            </div>

            {/* Tags */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              <span className="og-chip og-chip--active" style={{ fontSize: 10, padding: '3px 8px' }}>
                {{ star: '明星物种', ecosystem: '生态关键', surprise: '惊喜发现' }[selectedSpecies.tier] || selectedSpecies.tier}
              </span>
              <span className="og-chip" style={{ fontSize: 10, padding: '3px 8px' }}>
                {{ tiny: '微型', small: '小型', medium: '中型', large: '大型', massive: '巨型' }[selectedSpecies.display.scale] || selectedSpecies.display.scale}
              </span>
              <span className="og-chip" style={{ fontSize: 10, padding: '3px 8px' }}>
                {{ slow_cruise: '缓慢巡游', schooling: '群游', hovering: '悬停', drifting: '漂流', darting: '快速冲刺', static: '固着', none: '固着' }[selectedSpecies.display.animation] || selectedSpecies.display.animation}
              </span>
            </div>

            {/* Viewing spots */}
            <div
              className="og-section-label"
              style={{ marginBottom: 8 }}
            >
              观测地点 ({selectedSpecies.viewingSpots.length})
            </div>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {selectedSpecies.viewingSpots.map((spot, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    globe.flyTo(spot.lat, spot.lng, {
                      duration: 1500,
                      zoomDistance: 150,
                    });
                  }}
                  style={{
                    background: 'var(--og-bg-surface)',
                    border: '1px solid var(--og-border)',
                    borderRadius: 'var(--og-radius-sm)',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color var(--og-transition-fast)',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor =
                      'var(--og-border-active)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = 'var(--og-border)')
                  }
                >
                  <div
                    style={{
                      fontFamily: 'var(--og-font-body)',
                      fontSize: 13,
                      color: 'var(--og-text-primary)',
                      fontWeight: 500,
                    }}
                  >
                    {spot.name}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--og-font-mono)',
                      fontSize: 10,
                      color: 'var(--og-text-tertiary)',
                      marginTop: 3,
                      display: 'flex',
                      gap: 8,
                    }}
                  >
                    <span>{spot.season}</span>
                    <span style={{ textTransform: 'capitalize' }}>
                      {{ high: '高', medium: '中', seasonal: '季节性' }[spot.reliability] || spot.reliability}
                    </span>
                    <span>
                      {{ diving: '潜水', snorkeling: '浮潜', whale_watching: '观鲸', shore: '岸边', aquarium: '水族馆' }[spot.activity] || spot.activity}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Zoom controls ───────────────────────────────────────────────── */}
      <ZoomControls
        onZoomIn={() => {
          const canvas = document.querySelector('#og-app canvas');
          if (canvas)
            canvas.dispatchEvent(
              new WheelEvent('wheel', { deltaY: -300, bubbles: true }),
            );
        }}
        onZoomOut={() => {
          const canvas = document.querySelector('#og-app canvas');
          if (canvas)
            canvas.dispatchEvent(
              new WheelEvent('wheel', { deltaY: 300, bubbles: true }),
            );
        }}
      />

      {/* ── Route hover tooltip (DOM-managed) ────────────────────────── */}
      <div
        ref={routeTooltipRef}
        className="og-glass"
        style={{
          display: 'none',
          position: 'fixed',
          zIndex: 30,
          padding: '8px 12px',
          cursor: 'pointer',
          maxWidth: 250,
          borderRadius: 'var(--og-radius-sm)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Mobile controls toggle ──────────────────────────────────────── */}
      <button
        onClick={() => setShowControls((v) => !v)}
        className="og-glass md:hidden"
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 20,
          padding: '8px 16px',
          fontFamily: 'var(--og-font-body)',
          color: 'var(--og-text-primary)',
          fontSize: 11,
          cursor: 'pointer',
          background: 'transparent',
          border: 'none',
        }}
      >
        {showControls ? 'Close' : 'Controls'}
      </button>

      {/* ── Attribution ─────────────────────────────────────────────────── */}
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
        <span
          style={{
            fontFamily: 'var(--og-font-body)',
            fontSize: 10,
            color: 'var(--og-text-tertiary)',
            whiteSpace: 'nowrap',
          }}
        >
          数据来源: FishBase (CC-BY-NC) &middot; OBIS (CC-BY) &middot; GBIF
        </span>
      </div>
    </div>
  );
}
