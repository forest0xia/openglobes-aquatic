import type { CSSProperties } from 'react';

interface ZoomControlsProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

const svgStyle: CSSProperties = {
  display: 'block',
  transition: 'stroke var(--og-transition-fast)',
};

export function ZoomControls({ onZoomIn, onZoomOut }: ZoomControlsProps) {
  return (
    <div
      id="og-zoom"
      style={{
        position: 'absolute',
        bottom: '16px',
        right: '16px',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}
    >
      <button
        className="og-zoom-btn"
        style={{ borderRadius: '10px 10px 4px 4px' }}
        onClick={onZoomIn}
        aria-label="Zoom in"
        type="button"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--og-text-secondary)"
          strokeWidth="1.5"
          style={svgStyle}
          className="og-zoom-icon"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <button
        className="og-zoom-btn"
        style={{ borderRadius: '4px 4px 10px 10px' }}
        onClick={onZoomOut}
        aria-label="Zoom out"
        type="button"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--og-text-secondary)"
          strokeWidth="1.5"
          style={svgStyle}
          className="og-zoom-icon"
        >
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
