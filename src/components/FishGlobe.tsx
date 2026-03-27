import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { Globe } from '@openglobes/core';
import * as THREE from 'three';
import SearchBar from './SearchBar';
import { ZoomControls } from './ZoomControls';
import { useGlobeControls } from '../hooks/useGlobeControls';
import { useSpeciesData } from '../hooks/useSpeciesData';
import { useMigrationRoutes } from '../hooks/useMigrationRoutes';
import type { Species } from '../hooks/useSpeciesData';
import { flyTo } from '../utils/flyTo';

const FishDetail = lazy(() => import('./FishDetail').then(m => ({ default: m.FishDetail })));

// Screen-space projection for hover/click detection
const _projVec = new THREE.Vector3();

export function FishGlobe() {
  const globe = useGlobeControls();
  const { species, hotspots, loading: dataLoading } = useSpeciesData();
  const migration = useMigrationRoutes(globe.sceneRefsRef);

  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);
  const [hoveredSpecies, setHoveredSpecies] = useState<{ species: Species; x: number; y: number } | null>(null);
  const [showControls, setShowControls] = useState(true);
  const hoverThrottleRef = useRef(0);

  // Build species sprites once data + scene are both ready
  useEffect(() => {
    if (species.length > 0 && globe.sceneReady) {
      globe.buildSprites(species);
    }
  }, [species, globe.sceneReady, globe.buildSprites]);

  // Build migration route sprites once routes + scene are ready
  useEffect(() => {
    if (migration.migrationRoutes.length > 0 && globe.sceneReady) {
      globe.buildMigrationSprites(migration.migrationRoutes);
    }
  }, [migration.migrationRoutes, globe.sceneReady, globe.buildMigrationSprites]);

  // Find species nearest to cursor via screen-space projection (more reliable than raycasting)
  const findSpeciesAtCursor = useCallback((clientX: number, clientY: number): Species | null => {
    const refs = globe.sceneRefsRef.current;
    if (!refs) return null;
    const entries = globe.spriteLayerRef.current?.getEntries() ?? [];
    if (entries.length === 0) return null;

    const rect = refs.renderer.domElement.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    let bestScore = Infinity;
    let bestSpecies: Species | null = null;

    // Camera distance for screen-size estimation
    const camDist = refs.camera.position.length();

    for (let i = 0, len = entries.length; i < len; i++) {
      const e = entries[i];
      if (!e.sprite.visible) continue;
      _projVec.set(e.sprite.position.x, e.sprite.position.y, e.sprite.position.z);
      _projVec.project(refs.camera);
      // Skip behind camera
      if (_projVec.z > 1) continue;
      const sx = ((_projVec.x + 1) / 2) * rect.width;
      const sy = ((1 - _projVec.y) / 2) * rect.height;
      const dx = sx - mx;
      const dy = sy - my;
      const pixelDist = Math.sqrt(dx * dx + dy * dy);

      // Hit radius scales with sprite's world size projected to screen
      // Bigger sprites = bigger hit area, tiny sprites get a minimum 25px radius
      const worldSize = e.screenW || 1;
      const projectedSize = (worldSize / camDist) * rect.height * 0.5;
      const hitRadius = Math.max(25, projectedSize * 0.6);

      if (pixelDist < hitRadius && pixelDist < bestScore) {
        bestScore = pixelDist;
        bestSpecies = e.species;
      }
    }
    return bestSpecies;
  }, [globe.sceneRefsRef, globe.spriteLayerRef]);

  const lastPointerRef = useRef({ x: 0, y: 0 });
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Throttle to every 150ms and skip if pointer barely moved
    const now = Date.now();
    if (now - hoverThrottleRef.current < 150) return;
    const dx = e.clientX - lastPointerRef.current.x;
    const dy = e.clientY - lastPointerRef.current.y;
    if (dx * dx + dy * dy < 9) return; // less than 3px movement
    hoverThrottleRef.current = now;
    lastPointerRef.current.x = e.clientX;
    lastPointerRef.current.y = e.clientY;

    migration.handleRouteHover(e as any);

    const sp = findSpeciesAtCursor(e.clientX, e.clientY);
    if (sp) {
      setHoveredSpecies({ species: sp, x: e.clientX, y: e.clientY });
      (e.currentTarget as HTMLElement).style.cursor = 'pointer';
    } else {
      if (hoveredSpecies) setHoveredSpecies(null);
      (e.currentTarget as HTMLElement).style.cursor = 'default';
    }
  }, [findSpeciesAtCursor, migration, hoveredSpecies]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const sp = findSpeciesAtCursor(e.clientX, e.clientY);
    if (sp) {
      setSelectedSpecies(sp);
      setHoveredSpecies(null);
    }
  }, [findSpeciesAtCursor]);

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
      {/* ── Globe ───────────────────────────────────────────────────── */}
      <Globe
        key={globe.globeSkin}
        theme={globe.coreTheme}
        points={[]}
        trails={migration.memoTrails}
        onSceneReady={globe.handleSceneReady}
        onFrame={globe.handleFrame}
      />

      {/* ── Search bar ──────────────────────────────────────────────── */}
      <SearchBar
        totalSpecies={species.length || 200}
        onSelect={(point) => {
          const found = species.find(s =>
            s.name.toLowerCase().includes(point.name.toLowerCase()) ||
            s.nameZh === point.name
          );
          if (found) {
            setSelectedSpecies(found);
            const spot = found.viewingSpots[0];
            if (spot && globe.sceneRefsRef.current) {
              flyTo(globe.sceneRefsRef.current, spot.lat, spot.lng, {
                duration: 1500,
                zoomDistance: 130,
              });
            }
          }
        }}
      />

      {/* ── Control panel toggle ──────────────────────────────────── */}
      <button
        type="button"
        className={`og-chip${showControls ? ' og-chip--active' : ''}`}
        onClick={() => setShowControls(v => !v)}
        style={{
          position: 'absolute', top: 52, left: 16, zIndex: 15,
          fontSize: 10, height: 26, padding: '0 10px',
        }}
      >
        Controls
      </button>

      {/* ── Control panel ─────────────────────────────────────────── */}
      {showControls && (
        <div
          className="og-glass hidden md:block"
          style={{
            position: 'absolute', top: 84, left: 16, width: 240, zIndex: 10,
            animation: 'slideInLeft 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          <div style={{ padding: '16px 16px 20px' }}>
            {!dataLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <span className="og-mono-sm" style={{ color: 'var(--og-accent)' }}>
                  {species.length} species &middot; {hotspots.length} hotspots
                </span>
              </div>
            )}

            <div>
              <div className="og-section-label">Overlays</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className={`og-chip${migration.showMigrations ? ' og-chip--active' : ''}`}
                  onClick={() => migration.setShowMigrations(v => !v)}>Migration Routes</button>
                <button type="button" className={`og-chip${migration.showCurrents ? ' og-chip--active' : ''}`}
                  onClick={() => migration.setShowCurrents(v => !v)}>Ocean Currents</button>
                <button type="button" className={`og-chip${globe.isNightMode ? ' og-chip--active' : ''}`}
                  onClick={() => globe.setThemeId(globe.isNightMode ? 'fish' : 'bioluminescence')}>Night Mode</button>
              </div>
            </div>

            {migration.showMigrations && migration.migrationRoutes.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="range" min={1} max={migration.migrationRoutes.length}
                  value={migration.maxMigrationRoutes || migration.migrationRoutes.length}
                  onChange={(e) => migration.setMaxMigrationRoutes(parseInt(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--og-accent)' }} />
                <span className="og-mono-sm" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                  {migration.maxMigrationRoutes || migration.migrationRoutes.length}/{migration.migrationRoutes.length}
                </span>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <div className="og-section-label">Labels</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['ocean', 'sea', 'continent', 'island'].map(type => (
                  <button key={type} type="button"
                    className={`og-chip${globe.labelTypes.includes(type) ? ' og-chip--active' : ''}`}
                    onClick={() => globe.setLabelTypes(prev =>
                      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                    )}
                    style={{ fontSize: 11, textTransform: 'capitalize' }}>
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="og-section-label">Globe Skin</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(globe.GLOBE_SKINS).map(([key, { label }]) => (
                  <button key={key} type="button"
                    className={`og-chip${globe.globeSkin === key ? ' og-chip--active' : ''}`}
                    onClick={() => globe.setGlobeSkin(key)}
                    style={{ fontSize: 11 }}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Hover tooltip ───────────────────────────────────────────── */}
      {hoveredSpecies && !selectedSpecies && (
        <div
          className="og-glass"
          style={{
            position: 'fixed',
            left: hoveredSpecies.x + 16,
            top: hoveredSpecies.y - 12,
            zIndex: 30,
            padding: '10px 14px',
            maxWidth: 280,
            borderRadius: 'var(--og-radius-md)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontFamily: 'var(--og-font-body)', fontSize: 14,
              fontWeight: 600, color: 'var(--og-text-primary)',
            }}>
              {hoveredSpecies.species.nameZh || hoveredSpecies.species.name}
            </span>
            {hoveredSpecies.species.nameZh && (
              <span style={{
                fontFamily: 'var(--og-font-mono)', fontSize: 10,
                color: 'var(--og-text-tertiary)', fontStyle: 'italic',
              }}>
                {hoveredSpecies.species.name}
              </span>
            )}
          </div>
          <div style={{
            fontFamily: 'var(--og-font-body)', fontSize: 12,
            color: 'var(--og-text-secondary)', lineHeight: 1.4,
          }}>
            {hoveredSpecies.species.tagline.en}
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="og-chip" style={{ fontSize: 9, padding: '2px 6px', textTransform: 'capitalize' }}>
              {hoveredSpecies.species.tier}
            </span>
            <span className="og-chip" style={{ fontSize: 9, padding: '2px 6px' }}>
              {hoveredSpecies.species.viewingSpots.length} locations
            </span>
            <span className="og-chip" style={{ fontSize: 9, padding: '2px 6px', textTransform: 'capitalize' }}>
              {hoveredSpecies.species.display.animation.replace('_', ' ')}
            </span>
          </div>
        </div>
      )}

      {/* ── Species detail panel (pinned on click) ──────────────────── */}
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
            animation: 'slideInLeft 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          <div style={{ padding: '20px' }}>
            {/* Close button */}
            <button
              type="button"
              onClick={() => setSelectedSpecies(null)}
              style={{
                position: 'absolute', top: 12, right: 12,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--og-text-tertiary)', fontSize: 18, padding: '4px',
              }}
            >
              &times;
            </button>

            {/* Name */}
            <div style={{ marginBottom: 4 }}>
              <div style={{
                fontFamily: 'var(--og-font-display)', fontSize: 22,
                fontWeight: 600, color: 'var(--og-text-primary)',
              }}>
                {selectedSpecies.nameZh || selectedSpecies.name}
              </div>
              {selectedSpecies.nameZh && (
                <div style={{
                  fontFamily: 'var(--og-font-mono)', fontSize: 12,
                  color: 'var(--og-text-tertiary)', fontStyle: 'italic', marginTop: 2,
                }}>
                  {selectedSpecies.scientificName}
                </div>
              )}
            </div>

            {/* Tagline */}
            <div style={{
              fontFamily: 'var(--og-font-body)', fontSize: 13,
              color: 'var(--og-text-secondary)', lineHeight: 1.5,
              marginBottom: 16,
            }}>
              {selectedSpecies.tagline.en}
              {selectedSpecies.tagline.zh && (
                <div style={{ color: 'var(--og-text-tertiary)', marginTop: 4, fontSize: 12 }}>
                  {selectedSpecies.tagline.zh}
                </div>
              )}
            </div>

            {/* Tags */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              <span className="og-chip og-chip--active" style={{ fontSize: 10, padding: '3px 8px', textTransform: 'capitalize' }}>
                {selectedSpecies.tier}
              </span>
              <span className="og-chip" style={{ fontSize: 10, padding: '3px 8px', textTransform: 'capitalize' }}>
                {selectedSpecies.display.scale}
              </span>
              <span className="og-chip" style={{ fontSize: 10, padding: '3px 8px', textTransform: 'capitalize' }}>
                {selectedSpecies.display.animation.replace('_', ' ')}
              </span>
            </div>

            {/* Viewing spots */}
            <div className="og-section-label" style={{ marginBottom: 8 }}>
              Viewing Spots ({selectedSpecies.viewingSpots.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedSpecies.viewingSpots.map((spot, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (globe.sceneRefsRef.current) {
                      flyTo(globe.sceneRefsRef.current, spot.lat, spot.lng, {
                        duration: 1500, zoomDistance: 150,
                      });
                    }
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
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--og-border-active)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--og-border)')}
                >
                  <div style={{
                    fontFamily: 'var(--og-font-body)', fontSize: 13,
                    color: 'var(--og-text-primary)', fontWeight: 500,
                  }}>
                    {spot.name}
                  </div>
                  <div style={{
                    fontFamily: 'var(--og-font-mono)', fontSize: 10,
                    color: 'var(--og-text-tertiary)', marginTop: 3,
                    display: 'flex', gap: 8,
                  }}>
                    <span>{spot.season}</span>
                    <span style={{ textTransform: 'capitalize' }}>{spot.reliability}</span>
                    <span style={{ textTransform: 'capitalize' }}>{spot.activity.replace('_', ' ')}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
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

      {/* ── Route hover tooltip ──────────────────────────────────── */}
      {migration.routeTooltip && (
        <div className="og-glass" style={{
          position: 'fixed', left: migration.routeTooltip.x + 12, top: migration.routeTooltip.y - 10,
          zIndex: 30, padding: '8px 12px', cursor: 'pointer', maxWidth: 250,
          borderRadius: 'var(--og-radius-sm)',
        }}>
          <div style={{ fontFamily: 'var(--og-font-body)', fontSize: 12, color: 'var(--og-text-primary)', fontWeight: 500 }}>
            {migration.routeTooltip.route.name}
          </div>
          <div style={{ fontFamily: 'var(--og-font-mono)', fontSize: 10, color: 'var(--og-text-tertiary)', marginTop: 2 }}>
            {migration.routeTooltip.route.species} &middot; {migration.routeTooltip.route.type}
          </div>
        </div>
      )}

      {/* ── Mobile controls toggle ──────────────────────────────────── */}
      <button onClick={() => setShowControls(v => !v)} className="og-glass md:hidden"
        style={{
          position: 'fixed', top: 16, left: 16, zIndex: 20, padding: '8px 16px',
          fontFamily: 'var(--og-font-body)', color: 'var(--og-text-primary)',
          fontSize: 11, cursor: 'pointer', background: 'transparent', border: 'none',
        }}>
        {showControls ? 'Close' : 'Controls'}
      </button>

      {/* ── Attribution ─────────────────────────────────────────────── */}
      <div id="og-attribution" style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, opacity: 0.35,
      }}>
        <span style={{
          fontFamily: 'var(--og-font-body)', fontSize: 10,
          color: 'var(--og-text-tertiary)', whiteSpace: 'nowrap',
        }}>
          Data: FishBase (CC-BY-NC) &middot; OBIS (CC-BY) &middot; GBIF
        </span>
      </div>
    </div>
  );
}
