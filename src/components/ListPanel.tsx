interface ListPanelProps {
  title: string;
  items: { id: string; name: string; extra?: string }[];
  onItemClick?: (id: string) => void;
  onClose: () => void;
}

export function ListPanel({ title, items, onItemClick, onClose }: ListPanelProps) {
  return (
    <div
      className="og-glass"
      style={{
        position: 'fixed',
        right: 16,
        top: 84,
        width: 280,
        zIndex: 15,
        animation: 'slideInRight 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 14px 8px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span className="og-section-label" style={{ marginBottom: 0 }}>
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--og-text-tertiary)',
            fontSize: 16,
            lineHeight: 1,
            padding: '0 2px',
          }}
          aria-label="Close"
        >
          &times;
        </button>
      </div>

      {/* Scrollable list */}
      <div style={{ maxHeight: 320, overflowY: 'auto', padding: '6px 10px 10px' }}>
        {items.length === 0 && (
          <div
            style={{
              fontFamily: 'var(--og-font-body)',
              fontSize: 12,
              color: 'var(--og-text-tertiary)',
              padding: '12px 4px',
            }}
          >
            No items
          </div>
        )}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onItemClick?.(item.id)}
            className="og-glass-inset"
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              cursor: onItemClick ? 'pointer' : 'default',
              padding: '8px 10px',
              marginBottom: 4,
              borderRadius: 'var(--og-radius-sm)',
              transition: 'background var(--og-transition-fast)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--og-font-body)',
                fontSize: 12,
                color: 'var(--og-text-primary)',
              }}
            >
              {item.name}
            </div>
            {item.extra && (
              <div
                style={{
                  fontFamily: 'var(--og-font-body)',
                  fontSize: 10,
                  color: 'var(--og-text-tertiary)',
                  marginTop: 2,
                }}
              >
                {item.extra}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
