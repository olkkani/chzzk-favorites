import type { RowData } from '../lib/favorites';

const LABEL = { live: '방송 중', offline: '방송 안 함', unknown: '상태 알 수 없음' } as const;

export interface FavoritesProps {
  rows: RowData[];
  collapsed: boolean;
  saveFailed: boolean;
  rail: boolean;
  onToggleCollapsed(): void;
  onRemove(channelId: string): void;
}

function StatusDot({ status }: { status: RowData['status'] }) {
  if (status === null) return null;
  if (status === 'offline') return <span className="fav-sr">{LABEL.offline}</span>;
  return <span className={`fav-dot fav-dot-${status}`} role="img" aria-label={LABEL[status]} />;
}

function Row({ row, rail, onRemove }: { row: RowData; rail: boolean; onRemove(id: string): void }) {
  const label = row.name ?? '…';
  return (
    <li className="fav-row">
      <a className="fav-link" href={`/${row.channelId}`} title={rail ? label : undefined}>
        {row.imageUrl ? (
          <img className="fav-avatar" src={row.imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="fav-avatar" aria-hidden="true" />
        )}
        {rail ? (
          <span className="fav-sr">{label}</span>
        ) : (
          <span className={row.status === 'live' ? 'fav-name fav-name-live' : 'fav-name'}>{label}</span>
        )}
        <StatusDot status={row.status} />
      </a>
      {!rail && (
        <button
          type="button"
          className="fav-remove"
          aria-label={`${row.name ?? row.channelId} 즐겨찾기에서 제거`}
          onClick={() => onRemove(row.channelId)}
        >
          ✕
        </button>
      )}
    </li>
  );
}

export function Favorites({ rows, collapsed, saveFailed, rail, onToggleCollapsed, onRemove }: FavoritesProps) {
  const showBody = rail || !collapsed;
  return (
    <nav className={rail ? 'fav-nav fav-rail' : 'fav-nav'} aria-label="즐겨찾기">
      {!rail && (
        <button type="button" className="fav-header" aria-expanded={!collapsed} onClick={onToggleCollapsed}>
          <span className="fav-title">즐겨찾기</span>
          <span className="fav-count">{rows.length}</span>
          <span className="fav-chevron" aria-hidden="true">
            {collapsed ? '⌄' : '⌃'}
          </span>
        </button>
      )}
      {saveFailed && (
        <p className="fav-banner" role="alert">
          저장하지 못했어요. 즐겨찾기가 다른 기기에 반영되지 않을 수 있어요.
        </p>
      )}
      {showBody &&
        (rows.length === 0 ? (
          rail ? null : <p className="fav-empty">채널 페이지의 ☆를 눌러 추가하세요</p>
        ) : (
          <ul className="fav-list">
            {rows.map((r) => (
              <Row key={r.channelId} row={r} rail={rail} onRemove={onRemove} />
            ))}
          </ul>
        ))}
    </nav>
  );
}
