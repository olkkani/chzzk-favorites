import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Favorites, type FavoritesProps } from './Favorites';
import type { RowData } from '../lib/favorites';

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const C = 'c'.repeat(32);
const row = (over: Partial<RowData> = {}): RowData => ({ channelId: A, name: '한동숙', imageUrl: null, status: 'offline', category: null, viewers: null, ...over });

const setup = (over: Partial<FavoritesProps> = {}) => {
  const props: FavoritesProps = {
    rows: [row()],
    totalCount: 1,
    collapsed: false,
    saveFailed: false,
    rail: false,
    onToggleCollapsed: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  };
  return { ...render(<Favorites {...props} />), props };
};

describe('Favorites', () => {
  it('is a navigation landmark labelled 즐겨찾기 with a count and one link per row', () => {
    setup({ rows: [row(), row({ channelId: B, name: '침착맨' })] });
    const nav = screen.getByRole('navigation', { name: '즐겨찾기' });
    expect(within(nav).getByRole('button', { expanded: true }).textContent).toContain('2');
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([`/${A}`, `/${B}`]);
  });

  it('marks a live row with a labelled dot and a live name class', () => {
    setup({ rows: [row({ status: 'live' })] });
    expect(screen.getByRole('img', { name: '방송 중' })).toBeTruthy();
    expect(screen.getByText('한동숙').className).toContain('fav-name-live');
  });

  it('announces offline as text, unknown as a labelled dot, and shows nothing while loading', () => {
    setup({ rows: [row({ status: 'offline' }), row({ channelId: B, status: 'unknown' }), row({ channelId: C, status: null })] });
    expect(screen.getByText('방송 안 함')).toBeTruthy();
    expect(screen.getByRole('img', { name: '상태 알 수 없음' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')[2]!.querySelector('.fav-dot, .fav-sr:not(.fav-name)')).toBeNull();
  });

  it('shows the exact empty hint and no list when there are no favorites', () => {
    setup({ rows: [], totalCount: 0 });
    expect(screen.getByText('채널 페이지의 ☆를 눌러 추가하세요')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows a no-live hint when favorites exist but none are live', () => {
    setup({ rows: [], totalCount: 2 });
    expect(screen.getByText('방송 중인 즐겨찾기가 없어요')).toBeTruthy();
    expect(screen.queryByText('채널 페이지의 ☆를 눌러 추가하세요')).toBeNull();
  });

  it('hides rows and the hint when collapsed and toggles through the header', () => {
    const { props } = setup({ collapsed: true });
    expect(screen.queryByRole('list')).toBeNull();
    const header = screen.getByRole('button', { expanded: false });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(header);
    expect(props.onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('shows the exact banner as an alert when saving failed', () => {
    setup({ saveFailed: true });
    expect(screen.getByRole('alert').textContent).toBe('저장하지 못했어요. 즐겨찾기가 다른 기기에 반영되지 않을 수 있어요.');
  });

  it('has a remove button named after the channel that calls onRemove with its id', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: '한동숙 즐겨찾기에서 제거' }));
    expect(props.onRemove).toHaveBeenCalledWith(A);
  });

  it('still renders a usable row for a channel with no known name', () => {
    const { props } = setup({ rows: [row({ name: null, status: 'unknown' })] });
    expect(screen.getByText('…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `${A} 즐겨찾기에서 제거` }));
    expect(props.onRemove).toHaveBeenCalledWith(A);
  });

  it('renders hostile names as inert text', () => {
    const { container } = setup({ rows: [row({ name: '<img src="x" onerror="alert(1)">' })] });
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText('<img src="x" onerror="alert(1)">')).toBeTruthy();
  });

  it('renders the avatar lazily with empty alt when an image url exists', () => {
    const { container } = setup({ rows: [row({ imageUrl: 'https://img/a.png' })] });
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://img/a.png');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('rail mode shows avatars only: no header, no remove buttons, name as title', () => {
    setup({ rail: true, rows: [row({ status: 'live' })] });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link').getAttribute('title')).toBe('한동숙');
    expect(screen.getByRole('img', { name: '방송 중' })).toBeTruthy();
  });

  it('rail mode with no favorites renders no hint', () => {
    setup({ rail: true, rows: [] });
    expect(screen.queryByText('채널 페이지의 ☆를 눌러 추가하세요')).toBeNull();
  });

  it('renders a category heading per group in order, with rows under each', () => {
    setup({
      rows: [
        row({ channelId: A, name: 'a', status: 'live', category: '게임A', viewers: 10 }),
        row({ channelId: B, name: 'b', status: 'live', category: '게임B', viewers: 99 }),
      ],
    });
    const nav = screen.getByRole('navigation', { name: '즐겨찾기' });
    const heads = within(nav).getAllByRole('heading');
    expect(heads.map((h) => h.textContent)).toEqual(['게임B', '게임A']);
    const groups = within(nav).getAllByRole('list');
    expect(within(groups[0]!).getByRole('link', { name: /b/ })).toBeTruthy();
  });

  it('labels rows without a category as 기타', () => {
    setup({ rows: [row({ status: 'live', category: null })] });
    expect(screen.getByRole('heading').textContent).toBe('기타');
  });

  it('omits headings in rail mode but keeps group order', () => {
    setup({
      rail: true,
      rows: [
        row({ channelId: A, name: 'a', status: 'live', category: '게임A', viewers: 10 }),
        row({ channelId: B, name: 'b', status: 'live', category: '게임B', viewers: 99 }),
      ],
    });
    expect(screen.queryAllByRole('heading')).toHaveLength(0);
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([`/${B}`, `/${A}`]);
  });

  it('shows the viewer count on live rows only', () => {
    setup({
      rows: [
        row({ channelId: A, name: 'a', status: 'live', viewers: 12345 }),
        row({ channelId: B, name: 'b', status: 'live', viewers: null }),
        row({ channelId: C, name: 'c', status: 'unknown', viewers: 50 }),
      ],
    });
    expect(screen.getByText('1.2만')).toBeTruthy();
    expect(screen.queryByText('50')).toBeNull();
    expect(document.querySelectorAll('.fav-viewers')).toHaveLength(1);
  });

  it('hides the viewer count in rail mode', () => {
    setup({ rail: true, rows: [row({ status: 'live', viewers: 12345 })] });
    expect(document.querySelector('.fav-viewers')).toBeNull();
  });
});
