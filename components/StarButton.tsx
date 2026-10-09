export interface StarButtonProps {
  channelId: string | null;
  isFavorite: boolean;
  onToggle(channelId: string): void;
}

export function StarButton({ channelId, isFavorite, onToggle }: StarButtonProps) {
  if (channelId === null) return null;
  return (
    <button
      type="button"
      className="fav-star"
      aria-pressed={isFavorite}
      aria-label={isFavorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}
      onClick={() => onToggle(channelId)}
    >
      {isFavorite ? '★' : '☆'}
    </button>
  );
}
