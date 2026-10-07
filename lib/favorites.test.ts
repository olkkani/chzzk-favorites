// lib/favorites.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  EMPTY_FAVORITES,
  addFavorite,
  buildRows,
  createDefaultStore,
  createFavoritesStore,
  favoritesItem,
  isFavorite,
  normalizeFavorites,
  removeFavorite,
  toggleSectionCollapsed,
  type FavoritesData,
} from './favorites';

const ID_A = 'a'.repeat(32);
const ID_B = 'b'.repeat(32);

describe('pure operations', () => {
  it('adds a new channel ungrouped at the top', () => {
    const d = addFavorite(addFavorite(EMPTY_FAVORITES, ID_A), ID_B);
    expect(d.items).toEqual([
      { channelId: ID_B, groupId: null },
      { channelId: ID_A, groupId: null },
    ]);
  });

  it('ignores a duplicate add and returns the same object', () => {
    const d = addFavorite(EMPTY_FAVORITES, ID_A);
    expect(addFavorite(d, ID_A)).toBe(d);
  });

  it('removes a channel and ignores an unknown one', () => {
    const d = addFavorite(EMPTY_FAVORITES, ID_A);
    expect(removeFavorite(d, ID_A).items).toEqual([]);
    expect(removeFavorite(d, ID_B)).toBe(d);
    expect(isFavorite(d, ID_A)).toBe(true);
    expect(isFavorite(d, ID_B)).toBe(false);
  });

  it('toggles the section collapsed flag without touching items', () => {
    const d = addFavorite(EMPTY_FAVORITES, ID_A);
    const t = toggleSectionCollapsed(d);
    expect(t.collapsed).toBe(true);
    expect(t.items).toBe(d.items);
  });

  it('never mutates EMPTY_FAVORITES', () => {
    addFavorite(EMPTY_FAVORITES, ID_A);
    expect(EMPTY_FAVORITES.items).toEqual([]);
  });
});

describe('normalizeFavorites (corrupt or old stored values)', () => {
  it.each([null, undefined, 42, 'x', [], {}, { items: 'no' }, { items: [null, 3, {}] }])(
    'falls back to an empty list for %j',
    (raw) => {
      expect(normalizeFavorites(raw)).toEqual(EMPTY_FAVORITES);
    },
  );

  it('keeps valid items and drops invalid ones', () => {
    const out = normalizeFavorites({
      collapsed: true,
      groups: [{ id: 'g', name: '게임', collapsed: false }, { nope: 1 }],
      items: [{ channelId: ID_A, groupId: 'g' }, { channelId: 5 }, { channelId: ID_B }],
    });
    expect(out).toEqual({
      collapsed: true,
      groups: [{ id: 'g', name: '게임', collapsed: false }],
      items: [
        { channelId: ID_A, groupId: 'g' },
        { channelId: ID_B, groupId: null },
      ],
    });
  });
});

describe('buildRows', () => {
  it('joins items with cached names and live status, null while loading', () => {
    const rows = buildRows(
      [{ channelId: ID_A, groupId: null }, { channelId: ID_B, groupId: null }],
      { [ID_A]: { name: '한동숙', imageUrl: 'https://x/y.png' } },
      { [ID_A]: 'live' },
    );
    expect(rows).toEqual([
      { channelId: ID_A, name: '한동숙', imageUrl: 'https://x/y.png', status: 'live' },
      { channelId: ID_B, name: null, imageUrl: null, status: null },
    ]);
  });
});

describe('createFavoritesStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = async (over: Partial<Parameters<typeof createFavoritesStore>[0]> = {}) => {
    const save = vi.fn(async (_d: FavoritesData) => {});
    const store = await createFavoritesStore({ load: async () => undefined, save, ...over });
    return { store, save };
  };

  it('starts empty when nothing is stored', async () => {
    const { store } = await make();
    expect(store.getState()).toEqual({ data: EMPTY_FAVORITES, saveStatus: 'ok' });
  });

  it('updates state at once but coalesces several changes into one write after 500 ms', async () => {
    const { store, save } = await make();
    store.add(ID_A);
    store.add(ID_B);
    store.remove(ID_A);
    expect(store.getState().data.items).toEqual([{ channelId: ID_B, groupId: null }]);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].items).toEqual([{ channelId: ID_B, groupId: null }]);
  });

  it('does not write when a change is a no-op (duplicate add)', async () => {
    const { store, save } = await make();
    store.add(ID_A);
    await store.flush();
    store.add(ID_A);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush() writes immediately and cancels the pending timer', async () => {
    const { store, save } = await make();
    store.add(ID_A);
    await store.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps local state and reports error when a write is rejected, then recovers', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('QUOTA_BYTES_PER_ITEM quota exceeded')).mockResolvedValue(undefined);
    const { store } = await make({ save });
    store.add(ID_A);
    await store.flush();
    expect(store.getState().saveStatus).toBe('error');
    expect(store.getState().data.items).toHaveLength(1);
    store.add(ID_B);
    await store.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![0].items).toHaveLength(2);
    expect(store.getState().saveStatus).toBe('ok');
  });

  it('adopts a remote change when nothing is pending and ignores it when dirty', async () => {
    let remote: (raw: unknown) => void = () => {};
    const { store } = await make({ watch: (cb) => ((remote = cb), () => {}) });
    remote({ collapsed: false, groups: [], items: [{ channelId: ID_A, groupId: null }] });
    expect(store.getState().data.items).toHaveLength(1);
    store.add(ID_B);
    remote({ collapsed: false, groups: [], items: [] });
    expect(store.getState().data.items).toHaveLength(2);
  });

  it('notifies subscribers and stops after unsubscribe', async () => {
    const { store } = await make();
    const l = vi.fn();
    const off = store.subscribe(l);
    store.add(ID_A);
    expect(l).toHaveBeenCalledTimes(1);
    off();
    store.add(ID_B);
    expect(l).toHaveBeenCalledTimes(1);
  });
});

describe('default store on the fake browser', () => {
  beforeEach(() => fakeBrowser.reset());

  it('persists to sync:favorites and loads it back', async () => {
    const store = await createDefaultStore({ delayMs: 0 });
    store.add(ID_A);
    await store.flush();
    expect(await favoritesItem.getValue()).toEqual({
      collapsed: false,
      groups: [],
      items: [{ channelId: ID_A, groupId: null }],
    });
    const again = await createDefaultStore();
    expect(again.getState().data.items).toEqual([{ channelId: ID_A, groupId: null }]);
  });
});
