import './style.css';
import ReactDOM, { type Root } from 'react-dom/client';
import { Favorites } from '../../components/Favorites';
import { StarButton } from '../../components/StarButton';
import { watchTheme } from '../../lib/dom-anchor';
import { createDefaultStore, isFavorite, type FavoritesStore } from '../../lib/favorites';
import { SELECTORS } from '../../lib/selectors';
import { useChannelId, useFavorites, useRail, useRows } from './hooks';

function FavoritesApp({ store }: { store: FavoritesStore }) {
  const state = useFavorites(store);
  const rows = useRows(store);
  const rail = useRail();
  return (
    <Favorites
      rows={rows}
      collapsed={state.data.collapsed}
      saveFailed={state.saveStatus === 'error'}
      rail={rail}
      onToggleCollapsed={store.toggleCollapsed}
      onRemove={store.remove}
    />
  );
}

function StarApp({ store, subscribe }: { store: FavoritesStore; subscribe: (cb: () => void) => () => void }) {
  const state = useFavorites(store);
  const channelId = useChannelId(subscribe);
  return (
    <StarButton
      channelId={channelId}
      isFavorite={channelId !== null && isFavorite(state.data, channelId)}
      onToggle={(id) => (isFavorite(store.getState().data, id) ? store.remove(id) : store.add(id))}
    />
  );
}

export default defineContentScript({
  matches: ['*://chzzk.naver.com/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const store = await createDefaultStore();
    ctx.onInvalidated(() => store.dispose());
    ctx.addEventListener(window, 'pagehide', () => void store.flush());
    ctx.addEventListener(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') void store.flush();
    });

    // One registration through ctx so WXT starts its location watcher; UIs subscribe to our own set.
    const locationListeners = new Set<() => void>();
    const notifyLocation = () => locationListeners.forEach((l) => l());
    ctx.addEventListener(window, 'wxt:locationchange', notifyLocation);
    ctx.addEventListener(window, 'popstate', notifyLocation);
    const subscribeLocation = (cb: () => void) => {
      locationListeners.add(cb);
      return () => void locationListeners.delete(cb);
    };

    const mount = (name: string, anchor: string, append: 'before' | 'after', render: (root: Root) => void) =>
      createShadowRootUi(ctx, {
        name,
        position: 'inline',
        anchor,
        append,
        onMount: (container) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'fav-root';
          container.append(wrapper);
          const stopTheme = watchTheme(document, (theme) => (wrapper.dataset.theme = theme));
          const root = ReactDOM.createRoot(wrapper);
          render(root);
          return { root, stopTheme };
        },
        onRemove: (mounted) => {
          mounted?.stopTheme();
          mounted?.root.unmount();
        },
      });

    const favoritesUi = await mount('chzzk-favorites-list', SELECTORS.followingList, 'before', (root) =>
      root.render(<FavoritesApp store={store} />),
    );
    const starUi = await mount('chzzk-favorites-star', SELECTORS.channelFollowButton, 'after', (root) =>
      root.render(<StarApp store={store} subscribe={subscribeLocation} />),
    );
    favoritesUi.autoMount();
    starUi.autoMount();
  },
});
