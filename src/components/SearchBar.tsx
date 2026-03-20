import React, { useState } from 'react';

interface SearchBarProps {
  totalSpecies?: number;
}

export default function SearchBar({ totalSpecies = 4677 }: SearchBarProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      id="og-search"
      style={{
        position: 'absolute',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        width: '300px',
      }}
    >
      <style>{`
        @media (max-width: 640px) {
          #og-search {
            width: calc(100% - 32px) !important;
          }
        }

        #og-search .search-inner {
          border-radius: var(--og-radius-md);
          padding: 8px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          border-color: var(--og-border);
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

        #og-search input::placeholder {
          color: var(--og-text-tertiary);
        }
      `}</style>

      <div className="og-glass-heavy search-inner">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--og-text-tertiary)"
          strokeWidth="2"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        <input
          type="search"
          placeholder={`Search ${totalSpecies.toLocaleString()} species...`}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
