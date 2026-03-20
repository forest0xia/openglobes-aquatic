import { useState, useEffect } from 'react';
import type { PointItem } from '@openglobes/core';
import { SCHOOLING_SPECIES } from '../data/schooling';
import { DepthStrip } from './DepthStrip';
import { SizeComparison } from './SizeComparison';

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
  const [imgIdx, setImgIdx] = useState(0);

  // Reset image index on species change
  useEffect(() => { setImgIdx(0); }, [point.id]);

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
        /* Desktop: absolute positioned sidebar */
        position: 'absolute',
        top: 60,
        right: 16,
        width: 280,
        zIndex: 10,
        animation: 'slideInRight 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        /* Mobile overrides applied via media query below */
      }}
    >
      {/* Mobile drag handle — hidden on desktop via inline media logic */}
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
          #og-detail-drag-handle {
            display: block !important;
          }
        }
      `}</style>

      {/* Drag handle (mobile only) */}
      <div
        style={{
          paddingTop: 12,
          paddingBottom: 4,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <span
          id="og-detail-drag-handle"
          className="og-drag-handle"
          style={{ display: 'none' }}
        />
      </div>

      <div style={{ padding: 20 }}>
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

        {/* Image gallery */}
        <div
          style={{
            width: '100%',
            height: 140,
            borderRadius: 'var(--og-radius-md)',
            background: 'linear-gradient(135deg, rgba(8,20,40,0.8), rgba(5,12,25,0.9))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            border: '1px solid rgba(100,160,255,0.05)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {detail && detail.images && detail.images.length > 0 ? (
            <>
              <img
                src={detail.images[imgIdx]?.image ?? detail.images[0].image}
                alt={point.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  mixBlendMode: 'screen',
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              {detail.images.length > 1 && (
                <>
                  {/* Prev arrow */}
                  <button
                    type="button"
                    onClick={() => setImgIdx((i) => (i - 1 + detail.images.length) % detail.images.length)}
                    style={{
                      position: 'absolute',
                      left: 4,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'rgba(0,0,0,0.5)',
                      border: 'none',
                      color: '#fff',
                      borderRadius: '50%',
                      width: 22,
                      height: 22,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      padding: 0,
                    }}
                    aria-label="Previous image"
                  >
                    ‹
                  </button>
                  {/* Next arrow */}
                  <button
                    type="button"
                    onClick={() => setImgIdx((i) => (i + 1) % detail.images.length)}
                    style={{
                      position: 'absolute',
                      right: 4,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'rgba(0,0,0,0.5)',
                      border: 'none',
                      color: '#fff',
                      borderRadius: '50%',
                      width: 22,
                      height: 22,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      padding: 0,
                    }}
                    aria-label="Next image"
                  >
                    ›
                  </button>
                  {/* Dot indicators */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 6,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      gap: 4,
                    }}
                  >
                    {detail.images.map((_, i) => (
                      <span
                        key={i}
                        onClick={() => setImgIdx(i)}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: i === imgIdx ? '#fff' : 'rgba(255,255,255,0.35)',
                          cursor: 'pointer',
                          transition: 'background 200ms',
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <span style={{ fontSize: 32, opacity: 0.15 }}>🐟</span>
          )}
        </div>

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

        {/* Depth profile */}
        {detail && detail.metadata.depth && (() => {
          const parsed = parseDepth(detail.metadata.depth);
          return parsed ? (
            <div style={{ marginBottom: 16 }}>
              <div
                className="og-section-label"
                style={{ marginBottom: 8 }}
              >
                DEPTH PROFILE
              </div>
              <div
                style={{
                  fontFamily: 'var(--og-font-body)',
                  fontSize: 10,
                  color: 'var(--og-text-tertiary)',
                  marginBottom: 6,
                  opacity: 0.7,
                }}
              >
                Typical depth range for this species
              </div>
              <DepthStrip depthMin={parsed.min} depthMax={parsed.max} />
            </div>
          ) : null;
        })()}

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
