import { useState, useRef, useCallback, useEffect } from 'react';
import type { PointItem } from '@openglobes/core';

interface SearchEntry {
  id: string;
  name: string;
  lat: number;
  lng: number;
  wt: string;
}

interface SearchBarProps {
  totalSpecies?: number;
  onSelect: (point: PointItem) => void;
}

export default function SearchBar({ totalSpecies = 4677, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchEntry[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const indexRef = useRef<SearchEntry[]>([]);

  // Load search index once on mount
  useEffect(() => {
    fetch('/data/search.json')
      .then((r) => r.json())
      .then((data: SearchEntry[]) => {
        indexRef.current = data;
        setLoaded(true);
      })
      .catch(() => {});
  }, []);

  const doSearch = useCallback((q: string) => {
    if (q.length < 2 || indexRef.current.length === 0) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    const lower = q.toLowerCase();
    const matches: SearchEntry[] = [];

    for (const entry of indexRef.current) {
      if (entry.name.toLowerCase().includes(lower)) {
        matches.push(entry);
        if (matches.length >= 8) break;
      }
    }

    setResults(matches);
    setShowDropdown(matches.length > 0);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 600);
  }, [doSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(query);
    }
    if (e.key === 'Escape') {
      setShowDropdown(false);
      inputRef.current?.blur();
    }
  }, [doSearch, query]);

  const handleSelect = useCallback((entry: SearchEntry) => {
    setQuery(entry.name);
    setShowDropdown(false);
    onSelect({
      id: entry.id,
      lat: entry.lat,
      lng: entry.lng,
      name: entry.name,
    } as PointItem);
  }, [onSelect]);

  // Close dropdown on outside click
  useEffect(() => {
    const close = () => setShowDropdown(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  return (
    <div
      id="og-search"
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 25,
        width: 300,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <style>{`
        @media (max-width: 640px) {
          #og-search { width: calc(100% - 32px) !important; }
        }
        #og-search .search-inner {
          border-radius: var(--og-radius-md);
          padding: 8px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: border-color var(--og-transition-normal);
        }
        #og-search .search-inner:focus-within {
          border-color: var(--og-border-active);
        }
        #og-search input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          font-family: var(--og-font-body);
          font-size: 14px;
          color: var(--og-text-primary);
        }
        #og-search input::placeholder { color: var(--og-text-tertiary); }
      `}</style>

      <div className="og-glass-heavy search-inner">
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="var(--og-text-tertiary)" strokeWidth="2" aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={loaded
            ? `Search ${totalSpecies.toLocaleString()} species...`
            : 'Loading search...'
          }
          autoComplete="off"
          spellCheck={false}
        />

        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]); setShowDropdown(false); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--og-text-tertiary)', fontSize: 14, padding: '0 2px',
            }}
            aria-label="Clear"
          >
            ×
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {showDropdown && (
        <div
          className="og-glass"
          style={{
            marginTop: 4,
            borderRadius: 'var(--og-radius-md)',
            maxHeight: 280,
            overflowY: 'auto',
            padding: 4,
          }}
        >
          {results.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => handleSelect(entry)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 10px',
                borderRadius: 'var(--og-radius-sm)',
                transition: 'background var(--og-transition-fast)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--og-bg-surface)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <div style={{
                fontFamily: 'var(--og-font-body)',
                fontSize: 13,
                color: 'var(--og-text-primary)',
              }}>
                {entry.name}
              </div>
              {entry.wt && (
                <div style={{
                  fontFamily: 'var(--og-font-mono)',
                  fontSize: 10,
                  color: 'var(--og-text-tertiary)',
                  marginTop: 1,
                }}>
                  {entry.wt}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
