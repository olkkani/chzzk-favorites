import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { loadChannelCache, mergeCache, mergeStatus, pruneRecord, saveChannelCache, startPolling, type Poller } from '../../lib/chzzk-api';
import { parseChannelId, watchRail } from '../../lib/dom-anchor';
import { buildRows, filterLive, type CachedChannel, type FavoritesState, type FavoritesStore, type LiveStatus, type RowData } from '../../lib/favorites';

export function useFavorites(store: FavoritesStore): FavoritesState {
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useChannelId(
  subscribe: (cb: () => void) => () => void,
  getPath: () => string = () => location.pathname,
): string | null {
  return useSyncExternalStore(subscribe, () => parseChannelId(getPath()));
}

export function useRail(): boolean {
  const [rail, setRail] = useState(false);
  useEffect(() => watchRail(document, setRail), []);
  return rail;
}

export function useRows(store: FavoritesStore): RowData[] {
  const state = useFavorites(store);
  const [cache, setCache] = useState<Record<string, CachedChannel>>({});
  const [status, setStatus] = useState<Record<string, LiveStatus>>({});
  const cacheRef = useRef(cache);
  const statusRef = useRef(status);
  const pollerRef = useRef<Poller | null>(null);
  const idsKey = state.data.items.map((i) => i.channelId).join(',');

  useEffect(() => {
    let cancelled = false;
    void loadChannelCache().then((stored) => {
      if (cancelled) return;
      cacheRef.current = { ...stored, ...cacheRef.current };
      setCache(cacheRef.current);
    });
    const poller = startPolling({
      getIds: () => store.getState().data.items.map((i) => i.channelId),
      onResults: (results) => {
        const ids = store.getState().data.items.map((i) => i.channelId);
        cacheRef.current = pruneRecord(mergeCache(cacheRef.current, results), ids);
        statusRef.current = pruneRecord(mergeStatus(statusRef.current, results), ids);
        setCache(cacheRef.current);
        setStatus(statusRef.current);
        void saveChannelCache(cacheRef.current);
      },
    });
    pollerRef.current = poller;
    return () => {
      cancelled = true;
      poller.stop();
      pollerRef.current = null;
    };
  }, [store]);

  useEffect(() => {
    pollerRef.current?.refresh();
  }, [idsKey]);

  return useMemo(() => filterLive(buildRows(state.data.items, cache, status)), [state.data.items, cache, status]);
}
