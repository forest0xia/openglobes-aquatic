import { useState, useEffect } from 'react';
import type { PointItem } from '@openglobes/core';

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

  useEffect(() => {
    setLoading(true);
    setDetail(null);
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

        {/* Image placeholder */}
        <div
          style={{
            width: '100%',
            height: 120,
            borderRadius: 'var(--og-radius-md)',
            background: 'linear-gradient(135deg, rgba(8,20,40,0.8), rgba(5,12,25,0.9))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            border: '1px solid rgba(100,160,255,0.05)',
          }}
        >
          <span style={{ fontSize: 32, opacity: 0.15 }}>🐟</span>
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
