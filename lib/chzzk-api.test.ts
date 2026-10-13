import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  fetchChannel,
  loadChannelCache,
  mergeCache,
  mergeStatus,
  pollOnce,
  pruneRecord,
  saveChannelCache,
  startPolling,
  type ChannelInfo,
  type PollerDoc,
} from './chzzk-api';

const ID = 'a'.repeat(32);
const ok = (content: unknown) =>
  vi.fn(async (_url: RequestInfo | URL) => ({ ok: true, json: async () => ({ code: 200, content }) }) as unknown as Response);

const urlOf = (c: unknown[]) => String(c[0]);
const routed = (channels: unknown, detail: unknown) =>
  vi.fn(async (url: RequestInfo | URL) => {
    const content = String(url).includes('/live-detail') ? detail : channels;
    return { ok: content !== null, json: async () => ({ code: 200, content }) } as unknown as Response;
  });

describe('fetchChannel', () => {
  it('maps openLive true to live, keeps name and https image, and adds category and viewers from live-detail', async () => {
    const f = routed(
      { channelName: '한동숙', channelImageUrl: 'https://img/x.png', openLive: true },
      { liveCategoryValue: '저스트 채팅', concurrentUserCount: 321 },
    );
    expect(await fetchChannel(ID, f)).toEqual({
      channelId: ID, name: '한동숙', imageUrl: 'https://img/x.png', status: 'live', category: '저스트 채팅', viewers: 321,
    });
    expect(f.mock.calls.map(urlOf)).toEqual([
      `https://api.chzzk.naver.com/service/v1/channels/${ID}`,
      `https://api.chzzk.naver.com/service/v3/channels/${ID}/live-detail`,
    ]);
  });

  it('stays live with null category and viewers when live-detail fails', async () => {
    const f = routed({ channelName: 'x', channelImageUrl: null, openLive: true }, null);
    const r = await fetchChannel(ID, f);
    expect(r).toMatchObject({ status: 'live', category: null, viewers: null });
  });

  it('does not call live-detail for offline channels', async () => {
    const f = routed({ channelName: 'x', channelImageUrl: null, openLive: false }, {});
    await fetchChannel(ID, f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('maps openLive false to offline', async () => {
    const r = await fetchChannel(ID, ok({ channelName: 'x', channelImageUrl: null, openLive: false }));
    expect(r.status).toBe('offline');
    expect(r.imageUrl).toBeNull();
  });

  it('treats a non-ok response as unknown with no name', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response);
    expect(await fetchChannel(ID, f)).toEqual({ channelId: ID, name: null, imageUrl: null, status: 'unknown' });
  });

  it('treats a thrown fetch as unknown', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('network');
    });
    expect((await fetchChannel(ID, f)).status).toBe('unknown');
  });

  it('treats invalid JSON as unknown', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } }) as unknown as Response);
    expect((await fetchChannel(ID, f)).status).toBe('unknown');
  });

  it.each([undefined, 'true', 1, null])('treats openLive=%j as unknown (shape check)', async (openLive) => {
    const r = await fetchChannel(ID, ok({ channelName: 'x', openLive }));
    expect(r.status).toBe('unknown');
    expect(r.name).toBe('x');
  });

  it.each(['javascript:alert(1)', 'http://img/x.png', 'data:image/png;base64,AA', '//img/x.png'])(
    'drops the non-https image url %s',
    async (url) => {
      const r = await fetchChannel(ID, ok({ channelName: 'x', channelImageUrl: url, openLive: true }));
      expect(r.imageUrl).toBeNull();
    },
  );

  it('keeps hostile names as plain strings', async () => {
    const r = await fetchChannel(ID, ok({ channelName: '<img src=x onerror=alert(1)>', openLive: false }));
    expect(r.name).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('pollOnce', () => {
  it('keeps input order and never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let max = 0;
    const fetchOne = async (id: string): Promise<ChannelInfo> => {
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { channelId: id, name: id, imageUrl: null, status: 'offline' };
    };
    const ids = Array.from({ length: 10 }, (_, i) => `id${i}`);
    const out = await pollOnce(ids, fetchOne, 4);
    expect(out.map((r) => r.channelId)).toEqual(ids);
    expect(max).toBeLessThanOrEqual(4);
    expect(max).toBeGreaterThan(1);
  });

  it('returns an empty list for no ids', async () => {
    expect(await pollOnce([], async () => { throw new Error('unused'); })).toEqual([]);
  });
});

describe('merge helpers', () => {
  const live: ChannelInfo = { channelId: 'a', name: 'A', imageUrl: 'https://i/a', status: 'live' };
  const failed: ChannelInfo = { channelId: 'a', name: null, imageUrl: null, status: 'unknown' };

  it('mergeCache keeps a known name when a later result has none', () => {
    const first = mergeCache({}, [live]);
    expect(mergeCache(first, [failed])).toEqual({ a: { name: 'A', imageUrl: 'https://i/a' } });
  });

  it('mergeStatus overwrites status per channel and keeps others', () => {
    expect(mergeStatus({ b: 'offline' }, [live])).toEqual({ a: 'live', b: 'offline' });
    expect(mergeStatus({ a: 'live' }, [failed])).toEqual({ a: 'unknown' });
  });

  it('pruneRecord drops ids that are no longer favorites', () => {
    expect(pruneRecord({ a: 1, b: 2 }, ['a'])).toEqual({ a: 1 });
  });
});

class FakeDoc implements PollerDoc {
  visibilityState: DocumentVisibilityState = 'visible';
  private ls = new Set<() => void>();
  addEventListener(_t: 'visibilitychange', cb: () => void) { this.ls.add(cb); }
  removeEventListener(_t: 'visibilitychange', cb: () => void) { this.ls.delete(cb); }
  set(v: DocumentVisibilityState) { this.visibilityState = v; this.ls.forEach((l) => l()); }
}

describe('startPolling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const info = (id: string): ChannelInfo => ({ channelId: id, name: id, imageUrl: null, status: 'offline' });

  it('polls at start and every 60 s while visible', async () => {
    const fetchOne = vi.fn(async (id: string) => info(id));
    const onResults = vi.fn();
    const p = startPolling({ getIds: () => ['a', 'b'], onResults, fetchOne, doc: new FakeDoc() });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchOne).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchOne).toHaveBeenCalledTimes(4);
    expect(onResults).toHaveBeenCalledTimes(2);
    p.stop();
  });

  it('makes no requests while hidden and refreshes once when visible again', async () => {
    const doc = new FakeDoc();
    doc.visibilityState = 'hidden';
    const fetchOne = vi.fn(async (id: string) => info(id));
    const p = startPolling({ getIds: () => ['a'], onResults: vi.fn(), fetchOne, doc });
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetchOne).not.toHaveBeenCalled();
    doc.set('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchOne).toHaveBeenCalledTimes(1);
    p.stop();
  });

  it('does nothing with no favorites', async () => {
    const fetchOne = vi.fn(async (id: string) => info(id));
    const p = startPolling({ getIds: () => [], onResults: vi.fn(), fetchOne, doc: new FakeDoc() });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchOne).not.toHaveBeenCalled();
    p.stop();
  });

  it('refresh() polls now, and a refresh during a running poll runs one more round', async () => {
    let ids = ['a'];
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const fetchOne = vi.fn(async (id: string) => {
      calls++;
      if (calls === 1) await gate;
      return info(id);
    });
    const onResults = vi.fn();
    const p = startPolling({ getIds: () => ids, onResults, fetchOne, doc: new FakeDoc() });
    await vi.advanceTimersByTimeAsync(0);
    ids = ['a', 'b'];
    p.refresh();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(onResults).toHaveBeenCalledTimes(2);
    expect(onResults.mock.calls[1]![0].map((r: ChannelInfo) => r.channelId)).toEqual(['a', 'b']);
    p.stop();
  });

  it('stop() ends polling and detaches the listener', async () => {
    const doc = new FakeDoc();
    const fetchOne = vi.fn(async (id: string) => info(id));
    const p = startPolling({ getIds: () => ['a'], onResults: vi.fn(), fetchOne, doc });
    await vi.advanceTimersByTimeAsync(0);
    p.stop();
    await vi.advanceTimersByTimeAsync(180_000);
    doc.set('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchOne).toHaveBeenCalledTimes(1);
  });
});

describe('channel cache item', () => {
  beforeEach(() => fakeBrowser.reset());
  it('round-trips and defaults to empty', async () => {
    expect(await loadChannelCache()).toEqual({});
    await saveChannelCache({ a: { name: 'A', imageUrl: null } });
    expect(await loadChannelCache()).toEqual({ a: { name: 'A', imageUrl: null } });
  });
});
