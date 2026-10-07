import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';

describe('test tooling', () => {
  beforeEach(() => fakeBrowser.reset());

  it('round-trips sync storage through the fake browser', async () => {
    const item = storage.defineItem<number>('sync:smoke', { fallback: 0 });
    await item.setValue(2);
    expect(await item.getValue()).toBe(2);
  });
});
