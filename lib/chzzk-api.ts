import { storage } from '#imports';
import type { CachedChannel, LiveStatus } from './favorites';

export interface ChannelInfo {
  channelId: string;
  name: string | null;
  imageUrl: string | null;
  status: LiveStatus;
}

const BASE = 'https://api.chzzk.naver.com/service/v1/channels/';

const httpsOnly = (v: unknown): string | null => (typeof v === 'string' && v.startsWith('https://') ? v : null);

export async function fetchChannel(channelId: string, fetchFn: typeof fetch = fetch): Promise<ChannelInfo> {
  const unknown: ChannelInfo = { channelId, name: null, imageUrl: null, status: 'unknown' };
  try {
    const res = await fetchFn(`${BASE}${channelId}`);
    if (!res.ok) return unknown;
    const body = (await res.json()) as { content?: Record<string, unknown> | null };
    const c = body?.content;
    if (typeof c !== 'object' || c === null) return unknown;
    const name = typeof c.channelName === 'string' ? c.channelName : null;
    const imageUrl = httpsOnly(c.channelImageUrl);
    if (typeof c.openLive !== 'boolean') return { channelId, name, imageUrl, status: 'unknown' };
    return { channelId, name, imageUrl, status: c.openLive ? 'live' : 'offline' };
  } catch {
    return unknown;
  }
}

export async function pollOnce(
  ids: string[],
  fetchOne: (id: string) => Promise<ChannelInfo>,
  concurrency = 4,
): Promise<ChannelInfo[]> {
  const out: ChannelInfo[] = new Array(ids.length);
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const i = next++;
      out[i] = await fetchOne(ids[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return out;
}

export function mergeCache(prev: Record<string, CachedChannel>, results: ChannelInfo[]): Record<string, CachedChannel> {
  const next = { ...prev };
  for (const r of results) {
    const old = prev[r.channelId];
    next[r.channelId] = { name: r.name ?? old?.name ?? null, imageUrl: r.imageUrl ?? old?.imageUrl ?? null };
  }
  return next;
}

export function mergeStatus(prev: Record<string, LiveStatus>, results: ChannelInfo[]): Record<string, LiveStatus> {
  const next = { ...prev };
  for (const r of results) next[r.channelId] = r.status;
  return next;
}

export function pruneRecord<T>(rec: Record<string, T>, keepIds: string[]): Record<string, T> {
  const keep = new Set(keepIds);
  return Object.fromEntries(Object.entries(rec).filter(([id]) => keep.has(id)));
}

export interface PollerDoc {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', cb: () => void): void;
  removeEventListener(type: 'visibilitychange', cb: () => void): void;
}
export interface PollerDeps {
  getIds(): string[];
  onResults(results: ChannelInfo[]): void;
  fetchOne?(id: string): Promise<ChannelInfo>;
  intervalMs?: number;
  concurrency?: number;
  doc?: PollerDoc;
}
export interface Poller {
  stop(): void;
  refresh(): void;
}

export function startPolling(deps: PollerDeps): Poller {
  const intervalMs = deps.intervalMs ?? 60_000;
  const doc: PollerDoc = deps.doc ?? document;
  const fetchOne = deps.fetchOne ?? ((id: string) => fetchChannel(id));
  let running = false;
  let pending = false;
  let stopped = false;

  async function tick(): Promise<void> {
    if (stopped || doc.visibilityState !== 'visible') return;
    if (running) {
      pending = true;
      return;
    }
    const ids = deps.getIds();
    if (ids.length === 0) return;
    running = true;
    try {
      const results = await pollOnce(ids, fetchOne, deps.concurrency ?? 4);
      if (!stopped) deps.onResults(results);
    } finally {
      running = false;
    }
    if (pending && !stopped) {
      pending = false;
      await tick();
    }
  }

  const onVisibility = () => void tick();
  doc.addEventListener('visibilitychange', onVisibility);
  const timer = setInterval(() => void tick(), intervalMs);
  void tick();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
      doc.removeEventListener('visibilitychange', onVisibility);
    },
    refresh: () => void tick(),
  };
}

export const channelCacheItem = storage.defineItem<Record<string, CachedChannel>>('local:channelCache', {
  fallback: {},
  version: 1,
});
export const loadChannelCache = () => channelCacheItem.getValue();
export const saveChannelCache = (c: Record<string, CachedChannel>) => channelCacheItem.setValue(c);
