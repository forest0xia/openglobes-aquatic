import { useState, useMemo, useCallback } from 'react';
import { useSpeciesData, type Species } from '../hooks/useSpeciesData';
import { getSpeciesSize, formatLength, getBodyGroup } from '../data/speciesSizes';

// ---------------------------------------------------------------------------
// FishEncyclopedia — sortable, filterable species catalogue.
// ---------------------------------------------------------------------------

type SortKey = 'size' | 'name' | 'spots' | 'group';
type SortDir = 'asc' | 'desc';

const SCALE_ORDER: Record<string, number> = {
  massive: 5, large: 4, medium: 3, small: 2, tiny: 1,
};

const SCALE_ZH: Record<string, string> = {
  tiny: '微型', small: '小型', medium: '中型', large: '大型', massive: '巨型',
};
const TIER_ZH: Record<string, string> = {
  star: '明星物种', ecosystem: '生态关键', surprise: '惊喜发现',
};
const ANIM_ZH: Record<string, string> = {
  slow_cruise: '缓慢巡游', schooling: '群游', hovering: '悬停',
  drifting: '漂流', darting: '快速冲刺', static: '固着', none: '固着',
};

export function FishEncyclopedia({ onBack, onSelect }: {
  onBack: () => void;
  onSelect: (species: Species) => void;
}) {
  const { species, loading } = useSpeciesData();
  const [sortKey, setSortKey] = useState<SortKey>('size');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterGroup, setFilterGroup] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);

  // Compute groups for filter tabs
  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const sp of species) set.add(getBodyGroup(sp.nameZh, sp.name));
    return Array.from(set).sort();
  }, [species]);

  // Sort and filter
  const sorted = useMemo(() => {
    let list = [...species];

    // Filter by group
    if (filterGroup) {
      list = list.filter(sp => getBodyGroup(sp.nameZh, sp.name) === filterGroup);
    }

    // Filter by search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(sp =>
        sp.nameZh.toLowerCase().includes(q) ||
        sp.name.toLowerCase().includes(q) ||
        sp.scientificName.toLowerCase().includes(q)
      );
    }

    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'size': {
          const sa = getSpeciesSize(a.nameZh, a.display.scale).lengthCm;
          const sb = getSpeciesSize(b.nameZh, b.display.scale).lengthCm;
          return (sa - sb) * dir;
        }
        case 'name':
          return a.nameZh.localeCompare(b.nameZh, 'zh') * dir;
        case 'spots':
          return (a.viewingSpots.length - b.viewingSpots.length) * dir;
        case 'group': {
          const ga = getBodyGroup(a.nameZh, a.name);
          const gb = getBodyGroup(b.nameZh, b.name);
          return ga.localeCompare(gb, 'zh') * dir;
        }
        default:
          return 0;
      }
    });

    return list;
  }, [species, sortKey, sortDir, filterGroup, search]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }, [sortKey]);

  if (loading) {
    return (
      <div style={{
        width: '100vw', height: '100vh',
        background: 'var(--og-bg-void)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--og-text-secondary)', fontFamily: 'var(--og-font-body)',
      }}>
        正在加载物种数据...
      </div>
    );
  }

  // Species detail view
  if (selectedSpecies) {
    const sz = getSpeciesSize(selectedSpecies.nameZh, selectedSpecies.display.scale);
    const spriteName = selectedSpecies.sprite.replace('.png', '');
    const HUMAN_HEIGHT_CM = 175;
    const maxDim = Math.max(sz.lengthCm, HUMAN_HEIGHT_CM);
    const humanPct = (HUMAN_HEIGHT_CM / maxDim) * 100;
    const fishPct = (sz.lengthCm / maxDim) * 100;

    return (
      <div style={{
        width: '100vw', minHeight: '100vh',
        background: 'var(--og-bg-void)',
        overflowY: 'auto',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
          {/* Back */}
          <button
            type="button"
            onClick={() => setSelectedSpecies(null)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--og-font-body)', fontSize: 13,
              color: 'var(--og-accent)', marginBottom: 16, padding: 0,
            }}
          >
            &larr; 返回图鉴
          </button>

          {/* Header */}
          <h1 style={{
            fontFamily: 'var(--og-font-display)', fontSize: 28, fontWeight: 600,
            color: 'var(--og-text-primary)', margin: 0,
          }}>
            {selectedSpecies.nameZh || selectedSpecies.name}
          </h1>
          <div style={{
            fontFamily: 'var(--og-font-mono)', fontSize: 13,
            color: 'var(--og-text-tertiary)', fontStyle: 'italic', marginTop: 4, marginBottom: 20,
          }}>
            {selectedSpecies.scientificName}
          </div>

          {/* Sprite at natural pixel size */}
          <div className="og-glass" style={{
            padding: 24, marginBottom: 20, display: 'flex',
            flexDirection: 'column', alignItems: 'center',
          }}>
            <img
              src={`/data/sprites/${spriteName}.png`}
              alt={selectedSpecies.nameZh}
              className="fish-sprite"
              style={{
                maxWidth: '100%',
                height: 'auto',
                imageRendering: 'auto',
              }}
            />
            <div style={{
              marginTop: 12, fontFamily: 'var(--og-font-mono)', fontSize: 12,
              color: 'var(--og-text-secondary)',
            }}>
              平均体长 <strong style={{ color: 'var(--og-text-primary)' }}>{formatLength(sz.lengthCm)}</strong>
              {' · '}
              体宽 <strong style={{ color: 'var(--og-text-primary)' }}>{formatLength(sz.widthCm)}</strong>
            </div>
          </div>

          {/* Description */}
          <div style={{
            fontFamily: 'var(--og-font-body)', fontSize: 14,
            color: 'var(--og-text-secondary)', lineHeight: 1.6, marginBottom: 20,
          }}>
            {selectedSpecies.tagline.zh || selectedSpecies.tagline.en}
          </div>

          {/* Tags */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
            <span className="og-chip og-chip--active" style={{ fontSize: 11, padding: '4px 10px' }}>
              {TIER_ZH[selectedSpecies.tier] || selectedSpecies.tier}
            </span>
            <span className="og-chip" style={{ fontSize: 11, padding: '4px 10px' }}>
              {SCALE_ZH[selectedSpecies.display.scale] || selectedSpecies.display.scale}
            </span>
            <span className="og-chip" style={{ fontSize: 11, padding: '4px 10px' }}>
              {ANIM_ZH[selectedSpecies.display.animation] || selectedSpecies.display.animation}
            </span>
            <span className="og-chip" style={{ fontSize: 11, padding: '4px 10px' }}>
              {getBodyGroup(selectedSpecies.nameZh, selectedSpecies.name)}
            </span>
            <span className="og-chip" style={{ fontSize: 11, padding: '4px 10px' }}>
              {selectedSpecies.viewingSpots.length} 个观测点
            </span>
          </div>

          {/* Size comparison with human */}
          <div className="og-glass" style={{ padding: 20, marginBottom: 24 }}>
            <div className="og-section-label" style={{ marginBottom: 16, fontSize: 12 }}>
              与人类大小对比
            </div>
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 24,
              justifyContent: 'center', minHeight: 120, padding: '0 16px',
            }}>
              {/* Human */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <svg
                  width={Math.max(28, humanPct * 0.4)}
                  height={Math.max(40, humanPct * 1.2)}
                  viewBox="0 0 40 100" fill="none"
                >
                  <circle cx="20" cy="8" r="7" fill="rgba(160,180,210,0.5)" />
                  <rect x="14" y="16" width="12" height="32" rx="4" fill="rgba(160,180,210,0.4)" />
                  <rect x="8" y="20" width="8" height="4" rx="2" fill="rgba(160,180,210,0.35)" />
                  <rect x="24" y="20" width="8" height="4" rx="2" fill="rgba(160,180,210,0.35)" />
                  <rect x="14" y="48" width="5" height="28" rx="2" fill="rgba(160,180,210,0.4)" />
                  <rect x="21" y="48" width="5" height="28" rx="2" fill="rgba(160,180,210,0.4)" />
                  <rect x="12" y="74" width="7" height="5" rx="2" fill="rgba(160,180,210,0.35)" />
                  <rect x="21" y="74" width="7" height="5" rx="2" fill="rgba(160,180,210,0.35)" />
                </svg>
                <span style={{
                  fontFamily: 'var(--og-font-mono)', fontSize: 10,
                  color: 'var(--og-text-tertiary)', marginTop: 6,
                }}>
                  人类 1.75m
                </span>
              </div>
              {/* Fish */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: Math.max(24, Math.min(300, fishPct * 3)),
                  height: Math.max(12, Math.min(150, fishPct * 1.5 * (sz.widthCm / sz.lengthCm))),
                  background: `linear-gradient(135deg, ${selectedSpecies.display.color}44, ${selectedSpecies.display.color}88)`,
                  border: `1px solid ${selectedSpecies.display.color}66`,
                  borderRadius: 'var(--og-radius-md)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{
                    fontFamily: 'var(--og-font-mono)', fontSize: 11,
                    color: 'var(--og-text-primary)', fontWeight: 500,
                  }}>
                    {formatLength(sz.lengthCm)}
                  </span>
                </div>
                <span style={{
                  fontFamily: 'var(--og-font-mono)', fontSize: 10,
                  color: 'var(--og-text-tertiary)', marginTop: 6,
                }}>
                  {selectedSpecies.nameZh}
                </span>
              </div>
            </div>
          </div>

          {/* Viewing spots */}
          {selectedSpecies.viewingSpots.length > 0 && (
            <div className="og-glass" style={{ padding: 20 }}>
              <div className="og-section-label" style={{ marginBottom: 12, fontSize: 12 }}>
                观测地点 ({selectedSpecies.viewingSpots.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedSpecies.viewingSpots.map((spot, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSelect(selectedSpecies)}
                    style={{
                      background: 'var(--og-bg-surface)',
                      border: '1px solid var(--og-border)',
                      borderRadius: 'var(--og-radius-sm)',
                      padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color var(--og-transition-fast)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--og-border-active)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--og-border)'}
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
                      <span>{{ high: '高', medium: '中', seasonal: '季节性' }[spot.reliability] || spot.reliability}</span>
                      <span>{{ diving: '潜水', snorkeling: '浮潜', whale_watching: '观鲸', shore: '岸边', aquarium: '水族馆' }[spot.activity] || spot.activity}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main list view
  return (
    <div style={{
      width: '100vw', minHeight: '100vh',
      background: 'var(--og-bg-void)',
      overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
        }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--og-font-body)', fontSize: 13,
              color: 'var(--og-accent)', padding: 0,
            }}
          >
            &larr; 返回地球
          </button>
          <h1 style={{
            fontFamily: 'var(--og-font-display)', fontSize: 24, fontWeight: 600,
            color: 'var(--og-text-primary)', margin: 0,
          }}>
            鱼类图鉴
          </h1>
          <span style={{
            fontFamily: 'var(--og-font-mono)', fontSize: 11,
            color: 'var(--og-text-tertiary)',
          }}>
            {sorted.length} / {species.length} 物种
          </span>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索物种名称..."
            style={{
              width: '100%', maxWidth: 400, padding: '8px 14px',
              background: 'var(--og-bg-surface)',
              border: '1px solid var(--og-border)',
              borderRadius: 'var(--og-radius-sm)',
              fontFamily: 'var(--og-font-body)', fontSize: 13,
              color: 'var(--og-text-primary)', outline: 'none',
            }}
          />
        </div>

        {/* Group filter chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            type="button"
            className={`og-chip${!filterGroup ? ' og-chip--active' : ''}`}
            onClick={() => setFilterGroup('')}
            style={{ fontSize: 11 }}
          >
            全部
          </button>
          {groups.map(g => (
            <button
              key={g}
              type="button"
              className={`og-chip${filterGroup === g ? ' og-chip--active' : ''}`}
              onClick={() => setFilterGroup(filterGroup === g ? '' : g)}
              style={{ fontSize: 11 }}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Sort controls */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {([
            ['size', '体型大小'],
            ['name', '名称'],
            ['spots', '观测点数'],
            ['group', '种类'],
          ] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`og-chip${sortKey === key ? ' og-chip--active' : ''}`}
              onClick={() => toggleSort(key)}
              style={{ fontSize: 11 }}
            >
              {label} {sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          ))}
        </div>

        {/* Species grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}>
          {sorted.map(sp => {
            const sz = getSpeciesSize(sp.nameZh, sp.display.scale);
            const spriteName = sp.sprite.replace('.png', '');
            return (
              <button
                key={sp.aphiaId}
                type="button"
                onClick={() => setSelectedSpecies(sp)}
                className="og-glass"
                style={{
                  padding: 14, cursor: 'pointer', textAlign: 'left',
                  display: 'flex', flexDirection: 'column',
                  transition: 'border-color var(--og-transition-fast)',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--og-border-active)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--og-border)'}
              >
                {/* Sprite thumbnail — never exceed natural pixel size */}
                <div style={{
                  height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 10, overflow: 'hidden',
                }}>
                  <img
                    src={`/data/sprites/${spriteName}.png`}
                    alt={sp.nameZh}
                    className="fish-sprite"
                    loading="lazy"
                    style={{
                      maxWidth: '100%',
                      maxHeight: 80,
                      objectFit: 'contain',
                      imageRendering: 'auto',
                    }}
                  />
                </div>
                <div style={{
                  fontFamily: 'var(--og-font-body)', fontSize: 14,
                  color: 'var(--og-text-primary)', fontWeight: 500,
                  marginBottom: 2,
                }}>
                  {sp.nameZh || sp.name}
                </div>
                <div style={{
                  fontFamily: 'var(--og-font-mono)', fontSize: 10,
                  color: 'var(--og-text-tertiary)', fontStyle: 'italic',
                  marginBottom: 6,
                }}>
                  {sp.scientificName}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <span className="og-chip" style={{ fontSize: 9, padding: '2px 6px' }}>
                    {SCALE_ZH[sp.display.scale] || sp.display.scale}
                  </span>
                  <span className="og-chip" style={{ fontSize: 9, padding: '2px 6px' }}>
                    {formatLength(sz.lengthCm)}
                  </span>
                  <span className="og-chip" style={{ fontSize: 9, padding: '2px 6px' }}>
                    {sp.viewingSpots.length}点
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {sorted.length === 0 && (
          <div style={{
            textAlign: 'center', padding: 40,
            fontFamily: 'var(--og-font-body)', fontSize: 14,
            color: 'var(--og-text-tertiary)',
          }}>
            未找到匹配的物种
          </div>
        )}
      </div>
    </div>
  );
}
