import { SELECTORS } from './selectors';

/** 32 hex characters, optionally behind /live/, optionally followed by a sub-path. */
const CHANNEL_PATH = /^\/(?:live\/)?([0-9a-f]{32})(?:\/.*)?$/;

export function parseChannelId(pathname: string): string | null {
  const m = CHANNEL_PATH.exec(pathname);
  return m?.[1] ?? null;
}

export const isRailCollapsed = (doc: Document): boolean =>
  SELECTORS.sidebarCollapsed !== '' && doc.querySelector(SELECTORS.sidebarCollapsed) !== null;

export const isDarkTheme = (doc: Document): boolean =>
  SELECTORS.themeDark !== '' && doc.querySelector(SELECTORS.themeDark) !== null;

/** Watches class/style/data attributes and reports changes at most once per animation frame. */
function watchBoolean(doc: Document, read: () => boolean, cb: (value: boolean) => void): () => void {
  let last = read();
  cb(last);
  let frame = 0;
  const check = () => {
    frame = 0;
    const now = read();
    if (now !== last) {
      last = now;
      cb(now);
    }
  };
  const observer = new MutationObserver(() => {
    if (!frame) frame = requestAnimationFrame(check);
  });
  const options: MutationObserverInit = { attributes: true, subtree: true, childList: true };
  observer.observe(doc.documentElement, options);
  return () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
}

export const watchRail = (doc: Document, cb: (collapsed: boolean) => void) =>
  watchBoolean(doc, () => isRailCollapsed(doc), cb);

export const watchTheme = (doc: Document, cb: (theme: 'light' | 'dark') => void) =>
  watchBoolean(doc, () => isDarkTheme(doc), (dark) => cb(dark ? 'dark' : 'light'));
