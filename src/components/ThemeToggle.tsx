import { useContext } from 'react';
import { ThemeContext, THEMES } from '../themes/index';

export function ThemeToggle() {
  const { theme, setThemeId } = useContext(ThemeContext);

  if (THEMES.length <= 1) return null;

  function handleClick() {
    const currentIndex = THEMES.findIndex((t) => t.id === theme.id);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    setThemeId(THEMES[nextIndex].id);
  }

  return (
    <button
      id="og-theme-toggle"
      className="og-glass"
      onClick={handleClick}
      title={theme.label}
      style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        zIndex: 20,
        width: '36px',
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        borderRadius: 'var(--og-radius-md)',
        background: 'var(--og-bg-glass)',
        border: '1px solid var(--og-border)',
        transition: 'border-color var(--og-transition-fast)',
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--og-text-secondary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="8" cy="10" r="1.5" fill="currentColor" />
        <circle cx="12" cy="7" r="1.5" fill="currentColor" />
        <circle cx="16" cy="10" r="1.5" fill="currentColor" />
        <circle cx="14" cy="15" r="1.5" fill="currentColor" />
      </svg>
    </button>
  );
}
