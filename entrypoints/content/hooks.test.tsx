import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFavoritesStore } from '../../lib/favorites';
import { useChannelId, useFavorites } from './hooks';

const ID = '75cbf189b3bb8f9f687d2aca0d0a382b';

describe('useChannelId', () => {
  it('derives the id from the path and updates when the location subscription fires', () => {
    let path = `/live/${ID}`;
    let notify: () => void = () => {};
    const subscribe = (cb: () => void) => ((notify = cb), () => {});
    const { result } = renderHook(() => useChannelId(subscribe, () => path));
    expect(result.current).toBe(ID);
    path = '/video/123';
    act(() => notify());
    expect(result.current).toBeNull();
  });
});

describe('useFavorites', () => {
  it('re-renders when the store changes', async () => {
    const store = await createFavoritesStore({ load: async () => undefined, save: vi.fn(async () => {}) });
    const { result } = renderHook(() => useFavorites(store));
    expect(result.current.data.items).toHaveLength(0);
    act(() => store.add(ID));
    expect(result.current.data.items).toHaveLength(1);
    store.dispose();
  });
});
