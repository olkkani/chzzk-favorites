// lib/favorites.ts
import { storage } from '#imports';

export type LiveStatus = 'live' | 'offline' | 'unknown';

export interface FavoriteItem {
  channelId: string;
  groupId: string | null;
}
export interface FavoriteGroup {
  id: string;
  name: string;
  collapsed: boolean;
}
export interface FavoritesData {
  collapsed: boolean;
  groups: FavoriteGroup[];
  items: FavoriteItem[];
}

export const EMPTY_FAVORITES: FavoritesData = { collapsed: false, groups: [], items: [] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function normalizeFavorites(raw: unknown): FavoritesData {
  if (!isObject(raw)) return EMPTY_FAVORITES;
  const groups: FavoriteGroup[] = Array.isArray(raw.groups)
    ? raw.groups.flatMap((g) =>
        isObject(g) && typeof g.id === 'string' && typeof g.name === 'string'
          ? [{ id: g.id, name: g.name, collapsed: g.collapsed === true }]
          : [],
      )
    : [];
  const items: FavoriteItem[] = Array.isArray(raw.items)
    ? raw.items.flatMap((i) =>
        isObject(i) && typeof i.channelId === 'string' && i.channelId !== ''
          ? [{ channelId: i.channelId, groupId: typeof i.groupId === 'string' ? i.groupId : null }]
          : [],
      )
    : [];
  if (!Array.isArray(raw.items) && !Array.isArray(raw.groups)) return EMPTY_FAVORITES;
  return { collapsed: raw.collapsed === true, groups, items };
}

export const isFavorite = (data: FavoritesData, channelId: string) => data.items.some((i) => i.channelId === channelId);

export function addFavorite(data: FavoritesData, channelId: string): FavoritesData {
  if (isFavorite(data, channelId)) return data;
  return { ...data, items: [{ channelId, groupId: null }, ...data.items] };
}

export function removeFavorite(data: FavoritesData, channelId: string): FavoritesData {
  if (!isFavorite(data, channelId)) return data;
  return { ...data, items: data.items.filter((i) => i.channelId !== channelId) };
}

export const toggleSectionCollapsed = (data: FavoritesData): FavoritesData => ({ ...data, collapsed: !data.collapsed });

export interface CachedChannel {
  name: string | null;
  imageUrl: string | null;
}
export interface RowData {
  channelId: string;
  name: string | null;
  imageUrl: string | null;
  status: LiveStatus | null;
}

export function buildRows(
  items: FavoriteItem[],
  cache: Record<string, CachedChannel>,
  status: Record<string, LiveStatus>,
): RowData[] {
  return items.map((i) => ({
    channelId: i.channelId,
    name: cache[i.channelId]?.name ?? null,
    imageUrl: cache[i.channelId]?.imageUrl ?? null,
    status: status[i.channelId] ?? null,
  }));
}

export const filterLive = (rows: RowData[]): RowData[] => rows.filter((r) => r.status !== 'offline');

export type SaveStatus = 'ok' | 'error';
export interface FavoritesState {
  data: FavoritesData;
  saveStatus: SaveStatus;
}
export interface StoreDeps {
  load: () => Promise<unknown>;
  save: (data: FavoritesData) => Promise<void>;
  watch?: (cb: (raw: unknown) => void) => () => void;
  delayMs?: number;
}
export interface FavoritesStore {
  getState(): FavoritesState;
  subscribe(listener: () => void): () => void;
  add(channelId: string): void;
  remove(channelId: string): void;
  toggleCollapsed(): void;
  flush(): Promise<void>;
  dispose(): void;
}

export async function createFavoritesStore(deps: StoreDeps): Promise<FavoritesStore> {
  const delay = deps.delayMs ?? 500;
  let state: FavoritesState = { data: normalizeFavorites(await deps.load()), saveStatus: 'ok' };
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const set = (next: Partial<FavoritesState>) => {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };

  async function flush(): Promise<void> {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (!dirty) return;
    dirty = false;
    try {
      await deps.save(state.data);
      if (state.saveStatus !== 'ok') set({ saveStatus: 'ok' });
    } catch {
      dirty = true;
      set({ saveStatus: 'error' });
    }
  }

  function mutate(fn: (d: FavoritesData) => FavoritesData) {
    const next = fn(state.data);
    if (next === state.data) return;
    dirty = true;
    set({ data: next });
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void flush(), delay);
  }

  const unwatch = deps.watch?.((raw) => {
    if (dirty) return;
    const next = normalizeFavorites(raw);
    if (JSON.stringify(next) === JSON.stringify(state.data)) return;
    set({ data: next });
  });

  return {
    getState: () => state,
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    add: (id) => mutate((d) => addFavorite(d, id)),
    remove: (id) => mutate((d) => removeFavorite(d, id)),
    toggleCollapsed: () => mutate(toggleSectionCollapsed),
    flush,
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      unwatch?.();
      listeners.clear();
    },
  };
}

export const favoritesItem = storage.defineItem<FavoritesData>('sync:favorites', {
  fallback: EMPTY_FAVORITES,
  version: 1,
});

export function createDefaultStore(opts: { delayMs?: number } = {}): Promise<FavoritesStore> {
  return createFavoritesStore({
    load: () => favoritesItem.getValue(),
    save: (d) => favoritesItem.setValue(d),
    watch: (cb) => favoritesItem.watch((v) => cb(v)),
    delayMs: opts.delayMs,
  });
}
