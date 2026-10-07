import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./selectors', () => ({
  SELECTORS: { followingList: '#following', channelFollowButton: '#follow', sidebarCollapsed: '.rail', themeDark: 'html.dark' },
}));

import { isDarkTheme, isRailCollapsed, parseChannelId, watchRail, watchTheme } from './dom-anchor';

const ID = '75cbf189b3bb8f9f687d2aca0d0a382b';
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

describe('parseChannelId', () => {
  it.each([
    [`/${ID}`, ID],
    [`/${ID}/`, ID],
    [`/live/${ID}`, ID],
    [`/live/${ID}/`, ID],
    [`/${ID}/community`, ID],
    [`/${ID}/videos`, ID],
  ])('%s -> channel id', (path, expected) => {
    expect(parseChannelId(path)).toBe(expected);
  });

  it.each(['/', '/video/123456', '/live/short', '/live', '/lives', '/category/game', `/xx${ID}`, `/${ID}extra`, ''])(
    '%s -> null',
    (path) => {
      expect(parseChannelId(path)).toBeNull();
    },
  );
});

describe('theme and rail detection', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.documentElement.className = '';
  });

  it('isDarkTheme follows the themeDark selector', () => {
    expect(isDarkTheme(document)).toBe(false);
    document.documentElement.classList.add('dark');
    expect(isDarkTheme(document)).toBe(true);
  });

  it('isRailCollapsed follows the sidebarCollapsed selector', () => {
    expect(isRailCollapsed(document)).toBe(false);
    document.body.innerHTML = '<aside class="rail"></aside>';
    expect(isRailCollapsed(document)).toBe(true);
  });

  it('watchTheme reports the current theme at once and on change, then stops', async () => {
    const cb = vi.fn();
    const stop = watchTheme(document, cb);
    expect(cb).toHaveBeenLastCalledWith('light');
    document.documentElement.classList.add('dark');
    await Promise.resolve();
    await frame();
    expect(cb).toHaveBeenLastCalledWith('dark');
    stop();
    const calls = cb.mock.calls.length;
    document.documentElement.classList.remove('dark');
    await Promise.resolve();
    await frame();
    expect(cb.mock.calls.length).toBe(calls);
  });

  it('watchRail reports the current state at once and on change, then stops', async () => {
    document.body.innerHTML = '<aside id="s"></aside>';
    const cb = vi.fn();
    const stop = watchRail(document, cb);
    expect(cb).toHaveBeenLastCalledWith(false);
    document.getElementById('s')!.className = 'rail';
    await Promise.resolve();
    await frame();
    expect(cb).toHaveBeenLastCalledWith(true);
    stop();
    const calls = cb.mock.calls.length;
    document.getElementById('s')!.className = '';
    await Promise.resolve();
    await frame();
    expect(cb.mock.calls.length).toBe(calls);
  });
});
