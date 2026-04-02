import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
// SearchBar removed — controls are inline chips now
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
import { loadOceanMask, isOcean } from '../utils/oceanMask';
import { playHoverSound, playClickSound, getSoundLabel, startUnderwaterAmbient, stopUnderwaterAmbient, startBackgroundMusic } from '../audio/FishAudio';
import type { TrailData } from '../globe/TrailLayer';

const _hitPoint = new THREE.Vector3(); // reusable for route hover ray hit
const _uwRayOrigin = new THREE.Vector3();
const _uwRayDir = new THREE.Vector3();

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
  const maxMigrationRoutes = 0; // 0 = show all routes
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
    loadOceanMask(); // preload land/ocean mask for dive restriction
  }, []);

  // ── Underwater ambient sound ─────────────────────────────────────────────
  useEffect(() => {
    if (globe.isUnderwater) {
      startUnderwaterAmbient();
    } else {
      stopUnderwaterAmbient();
    }
  }, [globe.isUnderwater]);

  // ── Auto-enter underwater via URL param ?v=uw ──────────────────────────
  const autoUwDone = useRef(false);
  useEffect(() => {
    if (autoUwDone.current || !globe.sceneReady || species.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('v') !== 'uw') return;
    autoUwDone.current = true;

    // Pick a random ocean point to dive into
    const oceanSpots = species.flatMap(sp => sp.viewingSpots);
    if (oceanSpots.length === 0) return;
    const spot = oceanSpots[Math.floor(Math.random() * oceanSpots.length)];

    // Gather species for the dive (same logic as double-click)
    const nearby: typeof species = [];
    const seen = new Set<number>();
    for (const sp of species) {
      for (const vs of sp.viewingSpots) {
        const dLat = vs.lat - spot.lat, dLng = vs.lng - spot.lng;
        if (dLat * dLat + dLng * dLng < 225 && !seen.has(sp.aphiaId)) {
          nearby.push(sp); seen.add(sp.aphiaId); break;
        }
      }
      if (nearby.length >= 20) break;
    }
    // Add large animals + corals
    const LK = /鲸|鲨|海豚|whale|shark|dolphin|orca/i;
    for (const sp of species) {
      if (seen.has(sp.aphiaId)) continue;
      if (LK.test(`${sp.nameZh} ${sp.name}`) && (sp.display.scale === 'large' || sp.display.scale === 'massive')) {
        nearby.push(sp); seen.add(sp.aphiaId);
      }
      if (nearby.length >= 35) break;
    }
    const CK = /珊瑚|海葵|海绵|砗磲|海星|海胆|coral|anemone|sponge/i;
    let cc = 0;
    for (const sp of species) {
      if (seen.has(sp.aphiaId)) continue;
      if (CK.test(`${sp.nameZh} ${sp.name}`)) { nearby.push(sp); seen.add(sp.aphiaId); cc++; }
      if (cc >= 15) break;
    }

    globe.enterUnderwater(spot.lat, spot.lng, nearby);
  }, [globe.sceneReady, species, globe]);

  // ── UI state ────────────────────────────────────────────────────────────
  const [landToast, setLandToast] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);
  // Hover tooltip managed via ref + DOM manipulation (no React re-render)
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef<Species | null>(null);
  // Controls are always visible as compact chips — no toggle needed
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
    const soundLabel = getSoundLabel(species);
    el.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">
        <span style="font-family:var(--og-font-body);font-size:14px;font-weight:600;color:var(--og-text-primary)">${name}</span>
        ${sub ? `<span style="font-family:var(--og-font-mono);font-size:10px;color:var(--og-text-tertiary);font-style:italic">${sub}</span>` : ''}
      </div>
      <div style="font-family:var(--og-font-body);font-size:12px;color:var(--og-text-secondary);line-height:1.4">${desc}</div>
      <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
        <span class="og-chip" style="font-size:9px;padding:2px 6px">${tierZh[species.tier] || species.tier}</span>
        <span class="og-chip" style="font-size:9px;padding:2px 6px">${species.viewingSpots.length}个观测点</span>
        <span class="og-chip" style="font-size:9px;padding:2px 6px">🔊 ${soundLabel}</span>
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

  // ── Build migration trails (debounced — slider drags don't rebuild every pixel)
  const trailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!globe.sceneReady || !globe.renderer) return;

    // Debounce: wait 300ms after last change before rebuilding
    if (trailTimerRef.current) clearTimeout(trailTimerRef.current);
    trailTimerRef.current = setTimeout(() => {
      const renderer = globe.renderer;
      if (!renderer) return;

      const migTrails = showMigrations ? getMigrationTrails(maxMigrationRoutes) : [];
      const curTrails = showCurrents ? OCEAN_CURRENTS : [];

      const trailData: TrailData[] = [
        ...migTrails.map((t: any) => ({
          waypoints: t.waypoints as { lat: number; lng: number }[],
          color: Array.isArray(t.color) ? t.color[0] : (t.color ?? '#4cc9f0'),
          width: t.width ?? 1.0,
          speed: t.speed,
          dashed: true, // migration = dashed
        })),
        ...curTrails.map((t: any) => ({
          waypoints: t.waypoints as { lat: number; lng: number }[],
          color: Array.isArray(t.color) ? t.color[0] : (t.color ?? '#4cc9f0'),
          width: t.width ?? 1.2,
          speed: t.speed,
          dashed: false, // currents = solid continuous
        })),
      ];

      const r = renderer.getRenderer();
      renderer.trailLayer.build(trailData, new THREE.Vector2(r.domElement.width, r.domElement.height));
    }, 300);

    return () => { if (trailTimerRef.current) clearTimeout(trailTimerRef.current); };
  }, [globe.sceneReady, showMigrations, showCurrents]);

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
  const isDraggingRef = useRef(false);
  const handlePointerDown = useCallback(() => {
    startBackgroundMusic(); // starts on first interaction, no-op after
    isDraggingRef.current = true;
    // Hide tooltips during drag
    hideTooltip();
    if (routeTooltipRef.current) routeTooltipRef.current.style.display = 'none';
    globe.renderer?.speciesLayer.setHighlight(-1);
  }, [hideTooltip]);
  const handlePointerUp = useCallback(() => { isDraggingRef.current = false; }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Skip ALL hover processing during globe rotation drag or underwater mode
      if (isDraggingRef.current || globe.isUnderwater) return;

      // Throttle to every 200ms and skip if pointer barely moved
      const now = Date.now();
      if (now - hoverThrottleRef.current < 200) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      if (dx * dx + dy * dy < 16) return; // 4px minimum movement
      hoverThrottleRef.current = now;
      lastPointerRef.current.x = e.clientX;
      lastPointerRef.current.y = e.clientY;

      // Species hover takes priority over route hover
      const hit = findHitAtCursor(e.clientX, e.clientY);
      if (hit) {
        showTooltip(hit.species, e.clientX, e.clientY);
        playHoverSound(hit.species);
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
        // Only check route hover when NOT dragging and pointer is relatively still
        handleRouteHover(e.clientX, e.clientY);
        (e.currentTarget as HTMLElement).style.cursor = 'default';
      }
    },
    [findHitAtCursor, handleRouteHover, showTooltip, hideTooltip],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (globe.isUnderwater) return; // no click handling in underwater mode
      const hit = findHitAtCursor(e.clientX, e.clientY);
      if (hit) {
        setSelectedSpecies(hit.species);
        playClickSound(hit.species);
        hideTooltip();
        // Highlight the selected instance
        if (globe.renderer) {
          const idx = globe.renderer.speciesLayer.findInstanceIndex(hit.species, hit.lat, hit.lng);
          globe.renderer.speciesLayer.setHighlight(idx);
        }
        globe.flyTo(hit.lat, hit.lng, { duration: 1500, zoomDistance: 140 });
      }
    },
    [findHitAtCursor, globe],
  );

  // ── Double-click to dive into underwater view ──────────────────────────
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (globe.isUnderwater || !globe.renderer) return;

      // Raycast to find where on the globe the user double-clicked
      const r = globe.renderer.getRenderer();
      const rect = r.domElement.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const camera = globe.renderer.getCamera();
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      // Ray-sphere intersection
      const origin = raycaster.ray.origin;
      const dir = raycaster.ray.direction;
      const a = dir.dot(dir);
      const b = 2 * origin.dot(dir);
      const c = origin.dot(origin) - GLOBE_RADIUS * GLOBE_RADIUS;
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) return;

      const t = (-b - Math.sqrt(discriminant)) / (2 * a);
      if (t < 0) return;

      const hp = origin.clone().addScaledVector(dir, t);
      const rr = hp.length();
      const hitLat = Math.asin(hp.y / rr) * (180 / Math.PI);
      const hitLng = Math.atan2(hp.x, hp.z) * (180 / Math.PI);

      // Block diving on land
      if (!isOcean(hitLat, hitLng)) {
        setLandToast(true);
        setTimeout(() => setLandToast(false), 2000);
        return;
      }

      // Find species near the click point (within ~15 degrees)
      const nearbySpecies: typeof species = [];
      const seen = new Set<number>();
      for (const sp of species) {
        for (const spot of sp.viewingSpots) {
          const dLat = spot.lat - hitLat;
          const dLng = spot.lng - hitLng;
          if (dLat * dLat + dLng * dLng < 225 && !seen.has(sp.aphiaId)) { // 15 deg radius
            nearbySpecies.push(sp);
            seen.add(sp.aphiaId);
            break;
          }
        }
        if (nearbySpecies.length >= 20) break; // cap at 20 species
      }

      // If no species nearby, grab some random ones for visual interest
      if (nearbySpecies.length < 5) {
        const shuffled = [...species].sort(() => Math.random() - 0.5);
        for (const sp of shuffled) {
          if (!seen.has(sp.aphiaId)) {
            nearbySpecies.push(sp);
            seen.add(sp.aphiaId);
          }
          if (nearbySpecies.length >= 12) break;
        }
      }

      // Always include large marine animals (whales, sharks, dolphins, seals)
      const LARGE_KEYWORDS = /鲸|鲨|海豚|whale|shark|dolphin|orca/i;
      for (const sp of species) {
        if (seen.has(sp.aphiaId)) continue;
        const name = `${sp.nameZh} ${sp.name} ${sp.scientificName}`;
        if (LARGE_KEYWORDS.test(name) && (sp.display.scale === 'large' || sp.display.scale === 'massive')) {
          nearbySpecies.push(sp);
          seen.add(sp.aphiaId);
        }
        if (nearbySpecies.length >= 35) break;
      }

      // Always include coral/reef species for seabed decorations
      const CORAL_KEYWORDS = /珊瑚|海葵|海绵|砗磲|海星|海胆|coral|anemone|sponge/i;
      let coralCount = 0;
      for (const sp of species) {
        if (seen.has(sp.aphiaId)) continue;
        if (CORAL_KEYWORDS.test(`${sp.nameZh} ${sp.name}`)) {
          nearbySpecies.push(sp);
          seen.add(sp.aphiaId);
          coralCount++;
        }
        if (coralCount >= 15) break; // enough variety for decorations
      }

      // Close any open panels
      setSelectedSpecies(null);
      hideTooltip();

      // Dive!
      globe.enterUnderwater(hitLat, hitLng, nearbySpecies);
    },
    [globe, species, hideTooltip],
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      id="og-app"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerMove={handlePointerMove}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
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

      {/* ── Control chips — compact row at top-left ─────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 15,
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        <button
          type="button"
          className={`og-chip${showMigrations ? ' og-chip--active' : ''}`}
          onClick={() => setShowMigrations((v) => !v)}
          style={{ fontSize: 11 }}
        >
          洄游路线
        </button>
        <button
          type="button"
          className={`og-chip${showCurrents ? ' og-chip--active' : ''}`}
          onClick={() => setShowCurrents((v) => !v)}
          style={{ fontSize: 11 }}
        >
          洋流
        </button>
        <button
          type="button"
          className={`og-chip${globe.isNightMode ? ' og-chip--active' : ''}`}
          onClick={() =>
            globe.setThemeId(globe.isNightMode ? 'fish' : 'bioluminescence')
          }
          style={{ fontSize: 11 }}
        >
          夜间模式
        </button>
        {!dataLoading && (
          <span
            style={{
              fontFamily: 'var(--og-font-mono)',
              fontSize: 10,
              color: 'var(--og-text-tertiary)',
              alignSelf: 'center',
              marginLeft: 4,
            }}
          >
            {species.length} 物种
          </span>
        )}
      </div>

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
              <button
                type="button"
                className="og-chip"
                style={{ fontSize: 10, padding: '3px 8px', cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  playClickSound(selectedSpecies);
                }}
              >
                🔊 {getSoundLabel(selectedSpecies)}
              </button>
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
                      zoomDistance: 130,
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

      {/* ── Underwater mode UI ─────────────────────────────────────────── */}
      {globe.isUnderwater && (
        <>
          {/* Surface button */}
          <button
            type="button"
            className="og-glass uw-surface-btn"
            onClick={() => globe.exitUnderwater()}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              zIndex: 50,
              padding: '10px 20px',
              cursor: 'pointer',
              border: '1px solid rgba(100, 200, 255, 0.3)',
              borderRadius: 'var(--og-radius-md)',
              fontFamily: 'var(--og-font-display)',
              fontSize: 14,
              fontWeight: 600,
              color: '#88ddff',
              background: 'rgba(4, 24, 48, 0.7)',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.3s ease',
              animation: 'fadeIn 800ms ease forwards',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(20, 60, 100, 0.8)';
              e.currentTarget.style.borderColor = 'rgba(100, 200, 255, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(4, 24, 48, 0.7)';
              e.currentTarget.style.borderColor = 'rgba(100, 200, 255, 0.3)';
            }}
          >
            浮出水面
          </button>

          {/* Virtual joystick — works on both desktop (mouse) and mobile (touch) */}
          <div
            style={{
              position: 'absolute',
              bottom: 40,
              left: 40,
              zIndex: 50,
              width: 100,
              height: 100,
              borderRadius: '50%',
              border: '2px solid rgba(100, 200, 255, 0.25)',
              background: 'rgba(4, 24, 48, 0.25)',
              touchAction: 'none',
              cursor: 'grab',
            }}
            ref={(el) => {
              if (!el) return;
              const OUTER_R = 50; // half of 100px container
              const KNOB_R = 16;  // knob visual radius
              const MAX_R = OUTER_R - KNOB_R; // max distance knob can travel
              const knob = el.querySelector('[data-knob]') as HTMLElement;
              if (!knob) return;

              let active = false;
              let cx = 0, cy = 0;

              const updateKnob = (clientX: number, clientY: number) => {
                let dx = clientX - cx;
                let dy = clientY - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                // Clamp to outer ring
                if (dist > MAX_R) {
                  dx = (dx / dist) * MAX_R;
                  dy = (dy / dist) * MAX_R;
                }
                knob.style.transform = `translate(${dx - KNOB_R}px, ${dy - KNOB_R}px)`;
                // Normalize to -1..1 (distance from center = speed)
                const nx = dx / MAX_R;
                const ny = -dy / MAX_R; // invert Y: up = forward
                globe.renderer?.setUnderwaterJoystick(nx, ny);
              };

              const reset = () => {
                active = false;
                knob.style.transform = `translate(-${KNOB_R}px, -${KNOB_R}px)`;
                globe.renderer?.setUnderwaterJoystick(0, 0);
              };

              // Touch events
              el.addEventListener('touchstart', (e: TouchEvent) => {
                e.preventDefault();
                active = true;
                const rect = el.getBoundingClientRect();
                cx = rect.left + OUTER_R;
                cy = rect.top + OUTER_R;
                updateKnob(e.touches[0].clientX, e.touches[0].clientY);
              }, { passive: false });
              el.addEventListener('touchmove', (e: TouchEvent) => {
                e.preventDefault();
                if (active) updateKnob(e.touches[0].clientX, e.touches[0].clientY);
              }, { passive: false });
              el.addEventListener('touchend', reset);
              el.addEventListener('touchcancel', reset);

              // Mouse events (desktop)
              el.addEventListener('mousedown', (e: MouseEvent) => {
                active = true;
                const rect = el.getBoundingClientRect();
                cx = rect.left + OUTER_R;
                cy = rect.top + OUTER_R;
                updateKnob(e.clientX, e.clientY);
                el.style.cursor = 'grabbing';
              });
              const onMouseMove = (e: MouseEvent) => {
                if (active) updateKnob(e.clientX, e.clientY);
              };
              const onMouseUp = () => {
                if (active) { reset(); el.style.cursor = 'grab'; }
              };
              document.addEventListener('mousemove', onMouseMove);
              document.addEventListener('mouseup', onMouseUp);
            }}
          >
            {/* Draggable knob */}
            <div
              data-knob=""
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-16px, -16px)',
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(100, 200, 255, 0.5)',
                border: '2px solid rgba(100, 200, 255, 0.7)',
                boxShadow: '0 0 8px rgba(100, 200, 255, 0.3)',
                pointerEvents: 'none',
                transition: 'transform 0.08s ease-out',
              }}
            />
          </div>

          {/* Vertical slider — up/down movement */}
          <div
            style={{
              position: 'absolute',
              bottom: 40,
              right: 40,
              zIndex: 50,
              width: 44,
              height: 120,
              borderRadius: 22,
              border: '2px solid rgba(100, 200, 255, 0.25)',
              background: 'rgba(4, 24, 48, 0.25)',
              touchAction: 'none',
              cursor: 'grab',
            }}
            ref={(el) => {
              if (!el) return;
              const TRACK_H = 120;
              const KNOB_R = 14;
              const MAX_Y = TRACK_H / 2 - KNOB_R;
              const knob = el.querySelector('[data-vknob]') as HTMLElement;
              if (!knob) return;

              let active = false;
              let cy = 0;

              const update = (clientY: number) => {
                let dy = clientY - cy;
                dy = Math.max(-MAX_Y, Math.min(MAX_Y, dy));
                knob.style.transform = `translate(-${KNOB_R}px, ${dy - KNOB_R}px)`;
                globe.renderer?.setUnderwaterVertical(-dy / MAX_Y); // up = positive
              };
              const reset = () => {
                active = false;
                knob.style.transform = `translate(-${KNOB_R}px, -${KNOB_R}px)`;
                globe.renderer?.setUnderwaterVertical(0);
              };

              el.addEventListener('touchstart', (e: TouchEvent) => {
                e.preventDefault(); active = true;
                cy = el.getBoundingClientRect().top + TRACK_H / 2;
                update(e.touches[0].clientY);
              }, { passive: false });
              el.addEventListener('touchmove', (e: TouchEvent) => {
                e.preventDefault(); if (active) update(e.touches[0].clientY);
              }, { passive: false });
              el.addEventListener('touchend', reset);
              el.addEventListener('touchcancel', reset);

              el.addEventListener('mousedown', (e: MouseEvent) => {
                active = true;
                cy = el.getBoundingClientRect().top + TRACK_H / 2;
                update(e.clientY);
                el.style.cursor = 'grabbing';
              });
              document.addEventListener('mousemove', (e: MouseEvent) => {
                if (active) update(e.clientY);
              });
              document.addEventListener('mouseup', () => {
                if (active) { reset(); el.style.cursor = 'grab'; }
              });
            }}
          >
            {/* Up/down labels */}
            <div style={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: 'rgba(100,200,255,0.5)' }}>▲</div>
            <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: 'rgba(100,200,255,0.5)' }}>▼</div>
            {/* Knob */}
            <div
              data-vknob=""
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-14px, -14px)',
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'rgba(100, 200, 255, 0.5)',
                border: '2px solid rgba(100, 200, 255, 0.7)',
                boxShadow: '0 0 8px rgba(100, 200, 255, 0.3)',
                pointerEvents: 'none',
                transition: 'transform 0.08s ease-out',
              }}
            />
          </div>

          {/* Underwater vignette overlay */}
          <div
            className="uw-vignette"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 40,
              background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0, 10, 30, 0.4) 100%)',
              animation: 'fadeIn 600ms ease forwards',
            }}
          />
        </>
      )}

      {/* ── Land toast ────────────────────────────────────────────────── */}
      {landToast && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 100,
            padding: '12px 24px',
            borderRadius: 'var(--og-radius-md)',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            fontFamily: 'var(--og-font-body)',
            fontSize: 14,
            color: 'rgba(230, 240, 255, 0.9)',
            pointerEvents: 'none',
            animation: 'fadeIn 300ms ease',
          }}
        >
          只能在海洋区域潜入水下
        </div>
      )}

      {/* ── Desktop double-click hint ────────────────────────────────── */}
      {!globe.isUnderwater && (
        <div
          className="hidden md:block"
          style={{
            position: 'absolute',
            bottom: 40,
            right: 16,
            zIndex: 10,
            opacity: 0.3,
            transition: 'opacity 0.3s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.3')}
        >
          <span
            style={{
              fontFamily: 'var(--og-font-body)',
              fontSize: 10,
              color: 'var(--og-text-tertiary)',
            }}
          >
            双击海面潜入水下
          </span>
        </div>
      )}

      {/* ── Mobile dive button ───────────────────────────────────────── */}
      {!globe.isUnderwater && (
        <button
          type="button"
          className="md:hidden og-glass"
          onClick={() => {
            if (!globe.renderer) return;
            // Dive at the center of the current viewport
            const cam = globe.renderer.getCamera();
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
            const origin = cam.position.clone();
            const a = dir.dot(dir);
            const b = 2 * origin.dot(dir);
            const c = origin.dot(origin) - GLOBE_RADIUS * GLOBE_RADIUS;
            const disc = b * b - 4 * a * c;
            if (disc < 0) return;
            const t = (-b - Math.sqrt(disc)) / (2 * a);
            if (t < 0) return;
            const hp = origin.clone().addScaledVector(dir, t);
            const rr = hp.length();
            const lat = Math.asin(hp.y / rr) * (180 / Math.PI);
            const lng = Math.atan2(hp.x, hp.z) * (180 / Math.PI);
            if (!isOcean(lat, lng)) {
              setLandToast(true);
              setTimeout(() => setLandToast(false), 2000);
              return;
            }
            // Gather nearby species (same logic as double-click)
            const nearby: typeof species = [];
            const seen = new Set<number>();
            for (const sp of species) {
              for (const spot of sp.viewingSpots) {
                const dLat = spot.lat - lat;
                const dLng = spot.lng - lng;
                if (dLat * dLat + dLng * dLng < 225 && !seen.has(sp.aphiaId)) {
                  nearby.push(sp);
                  seen.add(sp.aphiaId);
                  break;
                }
              }
              if (nearby.length >= 20) break;
            }
            if (nearby.length < 5) {
              const shuffled = [...species].sort(() => Math.random() - 0.5);
              for (const sp of shuffled) {
                if (!seen.has(sp.aphiaId)) { nearby.push(sp); seen.add(sp.aphiaId); }
                if (nearby.length >= 12) break;
              }
            }

            // Always include large marine animals (whales, sharks, dolphins, seals)
            const LARGE_KEYWORDS = /鲸|鲨|海豚|whale|shark|dolphin|orca/i;
            for (const sp of species) {
              if (seen.has(sp.aphiaId)) continue;
              const name = `${sp.nameZh} ${sp.name} ${sp.scientificName}`;
              if (LARGE_KEYWORDS.test(name) && (sp.display.scale === 'large' || sp.display.scale === 'massive')) {
                nearby.push(sp);
                seen.add(sp.aphiaId);
              }
              if (nearby.length >= 35) break;
            }

            // Always include coral/reef species for seabed decorations
            const CORAL_KW = /珊瑚|海葵|海绵|砗磲|海星|海胆|coral|anemone|sponge/i;
            let mCoralCount = 0;
            for (const sp of species) {
              if (seen.has(sp.aphiaId)) continue;
              if (CORAL_KW.test(`${sp.nameZh} ${sp.name}`)) {
                nearby.push(sp);
                seen.add(sp.aphiaId);
                mCoralCount++;
              }
              if (mCoralCount >= 15) break;
            }

            setSelectedSpecies(null);
            hideTooltip();
            globe.enterUnderwater(lat, lng, nearby);
          }}
          style={{
            position: 'absolute',
            bottom: 80,
            right: 16,
            zIndex: 20,
            padding: '10px 16px',
            border: '1px solid rgba(76, 201, 240, 0.3)',
            borderRadius: 'var(--og-radius-md)',
            fontFamily: 'var(--og-font-display)',
            fontSize: 12,
            fontWeight: 600,
            color: '#88ddff',
            background: 'rgba(4, 24, 48, 0.6)',
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
          }}
        >
          潜入水下
        </button>
      )}

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
