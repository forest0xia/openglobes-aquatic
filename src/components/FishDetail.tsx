import { useState, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { PointItem } from '@openglobes/core';
import { SCHOOLING_SPECIES } from '../data/schooling';
// DepthStrip removed — user found it confusing
import { SizeComparison } from './SizeComparison';

// Module-level variable to persist drag position across hide/show cycles
let savedDragPos: { x: number; y: number } | null = null;

const parseCm = (str: string): number | null => {
  const match = str.match(/([\d.]+)\s*cm/);
  return match ? parseFloat(match[1]) : null;
};

function parseDepth(str: string): { min: number; max: number } | null {
  const match = str.match(/(\d+)\s*-\s*(\d+)/);
  if (match) return { min: parseInt(match[1]), max: parseInt(match[2]) };
  const single = str.match(/(\d+)/);
  if (single) return { min: 0, max: parseInt(single[1]) };
  return null;
}

interface SpeciesDetail {
  id: string;
  name: string;
  nameZh?: string;
  scientificName: string;
  family?: string;
  familyZh?: string;
  description?: string;
  metadata: {
    maxLength?: string;
    maxWeight?: string;
    habitat?: string;
    depth?: string;
    diet?: string;
    rarity?: string;
  };
  images: { thumbnail: string; image: string }[];
  links: { label: string; url: string }[];
  attribution: string;
}

// Hex values for badge bg/border (CSS can't do color-mix reliably)
const RARITY_COLORS: Record<string, string> = {
  Common:    '#48bfe6',
  Uncommon:  '#56d6a0',
  Rare:      '#f9c74f',
  Legendary: '#ef476f',
  Mythic:    '#b185db',
};

// CSS var references (for text color)
const RARITY_VAR: Record<string, string> = {
  Common:    'var(--og-rarity-common)',
  Uncommon:  'var(--og-rarity-uncommon)',
  Rare:      'var(--og-rarity-rare)',
  Legendary: 'var(--og-rarity-legendary)',
  Mythic:    'var(--og-rarity-mythic)',
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface FishDetailProps {
  point: PointItem;
  onClose: () => void;
}

export function FishDetail({ point, onClose }: FishDetailProps) {
  const [detail, setDetail] = useState<SpeciesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSizeComp, setShowSizeComp] = useState(false);
  const galleryRef = useRef<HTMLDivElement>(null);

  // ── Drag state ──────────────────────────────────────────────────
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(savedDragPos);
  const dragStartRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  const handleDragStart = (e: ReactPointerEvent) => {
    const rect = (e.currentTarget.closest('#og-detail') as HTMLElement)?.getBoundingClientRect();
    if (!rect) return;
    dragStartRef.current = { mx: e.clientX, my: e.clientY, px: rect.left, py: rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleDragMove = (e: ReactPointerEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.mx;
    const dy = e.clientY - dragStartRef.current.my;
    const newPos = {
      x: dragStartRef.current.px + dx,
      y: dragStartRef.current.py + dy,
    };
    setDragPos(newPos);
    savedDragPos = newPos;
  };

  const handleDragEnd = () => {
    dragStartRef.current = null;
  };

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setShowSizeComp(false);
    fetch(`/data/species/${point.id}.json`)
      .then((r) => r.json())
      .then((d) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [point.id]);

  const rarity = detail?.metadata.rarity ?? 'Common';
  const rarityHex = RARITY_COLORS[rarity] ?? RARITY_COLORS['Common'];
  const rarityVar = RARITY_VAR[rarity] ?? RARITY_VAR['Common'];

  return (
    <div
      id="og-detail"
      className="og-glass"
      style={{
        /* Desktop: fixed positioned sidebar, draggable */
        position: 'fixed',
        top: dragPos?.y ?? 60,
        right: dragPos ? undefined : 16,
        left: dragPos?.x ?? undefined,
        width: 280,
        zIndex: 10,
        animation: dragPos ? undefined : 'slideInRight 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        /* Mobile overrides applied via media query below */
      }}
    >
      {/* Mobile override — on mobile, panel becomes a bottom sheet */}
      <style>{`
        @media (max-width: 767px) {
          #og-detail {
            position: fixed !important;
            top: auto !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: auto !important;
            border-radius: var(--og-radius-xl) var(--og-radius-xl) 0 0 !important;
          }
        }
      `}</style>

      {/* Drag handle — always visible on desktop, also acts as mobile handle */}
      <div
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        style={{
          cursor: 'grab',
          padding: '6px 0',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{
          width: 30,
          height: 3,
          borderRadius: 9999,
          background: 'var(--og-text-tertiary)',
          opacity: 0.4,
        }} />
      </div>

      {/* Close button — positioned at very top-right of panel */}
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
          transition: 'color var(--og-transition-fast)',
          zIndex: 2,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--og-text-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--og-text-tertiary)')}
      >
        ×
      </button>

      <div style={{ padding: 20, position: 'relative' }}>

        {/* Header row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'start',
            marginBottom: 4,
          }}
        >
          {/* Left: name + scientific name */}
          <div>
            <div
              style={{
                fontFamily: 'var(--og-font-display)',
                fontSize: 22,
                fontWeight: 500,
                color: 'var(--og-text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              {point.name}
            </div>
            {detail?.scientificName && (
              <div
                className="og-mono-sm"
                style={{
                  opacity: 0.55,
                  marginTop: 2,
                }}
              >
                {detail.scientificName}
              </div>
            )}
            {loading && !detail && (
              <div
                className="og-mono-sm"
                style={{ opacity: 0.55, marginTop: 2 }}
              >
                …
              </div>
            )}
          </div>

          {/* Right: rarity badge */}
          {detail?.metadata.rarity && (
            <span
              className="og-rarity-badge"
              style={{
                background: hexToRgba(rarityHex, 0.15),
                border: `1px solid ${hexToRgba(rarityHex, 0.3)}`,
                color: rarityVar,
              }}
            >
              {rarity}
            </span>
          )}
        </div>

        {/* Schooling species badge */}
        {detail && (() => {
          const nameLower = (point.name || '').toLowerCase();
          const isSchooling = [...SCHOOLING_SPECIES].some((s) => nameLower.includes(s));
          return isSchooling ? (
            <div style={{ marginTop: 6, marginBottom: 2 }}>
              <span
                className="og-glass-inset"
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  fontSize: 10,
                  fontFamily: 'var(--og-font-body)',
                  color: 'var(--og-accent)',
                }}
              >
                🐟 Schooling species
              </span>
            </div>
          ) : null;
        })()}

        {/* Chinese name + family line */}
        {detail && (detail.nameZh || detail.family) && (
          <div
            style={{
              fontFamily: 'var(--og-font-body)',
              fontSize: 12,
              color: 'var(--og-text-secondary)',
              opacity: 0.55,
              marginBottom: 12,
            }}
          >
            {[detail.familyZh, detail.family].filter(Boolean).join(' ')}
            {detail.nameZh && !detail.family && !detail.familyZh
              ? detail.nameZh
              : null}
          </div>
        )}

        {/* Image gallery — horizontal scroll strip */}
        {detail && detail.images && detail.images.length > 0 && (
          <div style={{ marginBottom: 16, position: 'relative' }}>
            <div
              ref={galleryRef}
              className="og-gallery-scroll"
              style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                scrollBehavior: 'smooth',
                scrollbarWidth: 'none', // Firefox
                msOverflowStyle: 'none', // IE
                borderRadius: 'var(--og-radius-md)',
                padding: '4px 0',
              }}
            >
              {detail.images.map((img, i) => (
                <img
                  key={i}
                  src={img.image}
                  alt={`${point.name} ${i + 1}`}
                  loading="lazy"
                  style={{
                    width: detail.images.length === 1 ? '100%' : 200,
                    height: 140,
                    objectFit: 'contain',
                    mixBlendMode: 'screen',
                    borderRadius: 'var(--og-radius-md)',
                    background: 'linear-gradient(135deg, rgba(8,20,40,0.8), rgba(5,12,25,0.9))',
                    border: '1px solid rgba(100,160,255,0.05)',
                    flexShrink: 0,
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ))}
            </div>

            {/* Left scroll button */}
            {detail.images.length > 1 && (
              <button
                type="button"
                onClick={() => galleryRef.current?.scrollBy({ left: -210, behavior: 'smooth' })}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 28,
                  background: 'linear-gradient(90deg, rgba(5,10,18,0.8), transparent)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  opacity: 0.7,
                  borderRadius: 'var(--og-radius-md) 0 0 var(--og-radius-md)',
                }}
                aria-label="Scroll left"
              >
                ‹
              </button>
            )}

            {/* Right scroll button */}
            {detail.images.length > 1 && (
              <button
                type="button"
                onClick={() => galleryRef.current?.scrollBy({ left: 210, behavior: 'smooth' })}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: 28,
                  background: 'linear-gradient(270deg, rgba(5,10,18,0.8), transparent)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  opacity: 0.7,
                  borderRadius: '0 var(--og-radius-md) var(--og-radius-md) 0',
                }}
                aria-label="Scroll right"
              >
                ›
              </button>
            )}
          </div>
        )}

        {/* No images fallback */}
        {detail && (!detail.images || detail.images.length === 0) && (
          <div
            style={{
              width: '100%',
              height: 80,
              borderRadius: 'var(--og-radius-md)',
              background: 'linear-gradient(135deg, rgba(8,20,40,0.8), rgba(5,12,25,0.9))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              border: '1px solid rgba(100,160,255,0.05)',
            }}
          >
            <span style={{ fontSize: 24, opacity: 0.15 }}>🐟</span>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div
            className="og-mono-sm"
            style={{
              opacity: 0.55,
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            Loading…
          </div>
        )}

        {/* Metadata grid */}
        {detail && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 16,
            }}
          >
            {detail.metadata.maxLength && (
              <MetaCell label="Length" value={detail.metadata.maxLength} />
            )}
            {detail.metadata.maxWeight && (
              <MetaCell label="Weight" value={detail.metadata.maxWeight} />
            )}
            {detail.metadata.depth && (
              <MetaCell label="Depth" value={detail.metadata.depth} />
            )}
            {detail.metadata.habitat && (
              <MetaCell label="Habitat" value={detail.metadata.habitat} />
            )}
          </div>
        )}

        {/* Compare Size button */}
        {detail && detail.metadata.maxLength && (() => {
          const cm = parseCm(detail.metadata.maxLength);
          return cm !== null ? (
            <div style={{ marginBottom: 16 }}>
              <button
                className="og-glass-inset"
                onClick={() => setShowSizeComp(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '7px 12px',
                  cursor: 'pointer',
                  border: 'none',
                  background: 'none',
                  color: 'var(--og-accent)',
                  fontFamily: 'var(--og-font-body)',
                  fontSize: 12,
                  textAlign: 'left',
                }}
              >
                <RulerIcon />
                Compare Size
              </button>
            </div>
          ) : null;
        })()}

        {/* Depth profile removed — user found it confusing */}

        {/* Links row */}
        {detail && detail.links.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {detail.links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="og-link-button"
                style={{
                  flex: 1,
                  padding: 8,
                  textDecoration: 'none',
                }}
              >
                {link.label}
                <ArrowIcon />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Size comparison overlay */}
      {showSizeComp && detail?.metadata.maxLength && (() => {
        const cm = parseCm(detail.metadata.maxLength);
        return cm !== null ? (
          <SizeComparison
            lengthCm={cm}
            speciesName={point.name}
            onClose={() => setShowSizeComp(false)}
          />
        ) : null;
      })()}
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="og-glass-inset">
      <div
        className="og-section-label"
        style={{ fontSize: 10, marginBottom: 0 }}
      >
        {label}
      </div>
      <div className="og-mono-value" style={{ marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M7 17L17 7M17 7H7M17 7V17" />
    </svg>
  );
}

function RulerIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.3 8.7 8.7 21.3c-.4.4-.8.6-1.3.6H4a1 1 0 0 1-1-1v-3.4c0-.5.2-.9.6-1.3L16.3 2.7a1 1 0 0 1 1.4 0l3.6 3.6a1 1 0 0 1 0 1.4z" />
      <path d="m7.5 10.5 2 2" />
      <path d="m10.5 7.5 2 2" />
      <path d="m13.5 4.5 2 2" />
      <path d="m4.5 13.5 2 2" />
    </svg>
  );
}
