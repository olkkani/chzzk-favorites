# CHZZK Sidebar Favorites, Stage 0 + Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome extension that injects a native-looking "즐겨찾기" section above the following list on chzzk.naver.com, with a ☆ toggle on channel pages, live/offline/unknown dots, and Chrome-profile-synced storage.

**Architecture:** A WXT content script mounts two shadow-root React UIs (favorites section, star button) anchored to CHZZK DOM selectors measured in Task 1. State lives in one versioned `sync:favorites` item behind a small store with coalesced writes; live status comes from CHZZK's public `/service/v1/channels/{id}` endpoint polled by the content script. Pure logic (`lib/`) is tested with Vitest + WXT's `fakeBrowser`; components with Testing Library; DOM anchors against saved HTML fixtures.

**Tech Stack:** WXT 0.21, React 19, TypeScript 5.9, Vitest + `WxtVitest()`, happy-dom, @testing-library/react.

**Spec:** `docs/designs/chzzk-sidebar-favorites.md` (design doc, eng review decisions R1-R8, design review decisions 1A-7B, tasks T1-T12 / DT1-DT6). Executors read both. Stage 2 (groups UI, dnd-kit, group menus) is a separate plan written after Task 1 results; the schema here already has `groups` so Stage 2 needs no migration.

**Execution order:** Task 2 (tooling) first, then Task 1 (manual spike, needs the test runner), then Tasks 3 and 4 (independent of Task 1, can run in parallel), then 5, 6, 7. Tasks 5 and 6 need Task 1's selectors, fixtures and tokens.

**Plan-level choices not in the spec (flag in review):**
1. Channel `name` and `imageUrl` are cached in an unsynced `local:channelCache` item (not in `sync:favorites`), so the R1 quota ceiling is unchanged. On a fresh device a row shows "…" until the first poll answers.
2. A newly added favorite triggers an immediate poll (`refresh()`), otherwise its name would be blank for up to 60 s.
3. The store flushes on `pagehide` so a quick click-away does not lose the last write.

## Global Constraints

- Storage: one WXT item `sync:favorites`, `version: 1`, holding `{ collapsed, groups, items }`; chrome.storage.sync limits 8,192 B per item, 102,400 B total, 120 writes/min; writes coalesced to at most 1 per 500 ms; a rejected write sets a visible error and keeps local state (R1, 2C).
- Mount with WXT `createShadowRootUi` and `cssInjectionMode: 'ui'`; own CSS tokens measured in Task 1, never CHZZK's class names (R2, 4A).
- Live status: only `GET https://api.chzzk.naver.com/service/v1/channels/{id}`; 1 request per favorite per poll; every 60 s while the tab is visible; paused while hidden, one refresh when visible again; at most 4 requests in flight; states `live` / `offline` / `unknown`; a failed or malformed response (`typeof content.openLive !== 'boolean'`) is `unknown` (R3, R6).
- Row = real link `<a href="/{channelId}">`, plain navigation, no click interception (R8, 6B).
- Manifest: `permissions: ['storage']` only, no `host_permissions`; `matches: ['*://chzzk.naver.com/*']`.
- Order is the user's order, never re-sorted by live state; live = green dot + bold name (1B).
- No height cap and no inner scroll; the section header collapses and its state is stored (1A).
- UI copy, exact: header `즐겨찾기`; empty hint `채널 페이지의 ☆를 눌러 추가하세요`; banner `저장하지 못했어요. 즐겨찾기가 다른 기기에 반영되지 않을 수 있어요.`; dot labels `방송 중` / `방송 안 함` / `상태 알 수 없음`; remove button name `{channel} 즐겨찾기에서 제거`.
- Accessibility: section is `nav` labelled `즐겨찾기`; dot state has a text label, not color alone; visible focus ring; body text contrast at least 4.5:1 in light and dark (6B).
- API text is untrusted: render as React text only, accept `imageUrl` only when it starts with `https://`.
- Desktop Chrome only. Never `git add -A` or `git add .`: the working tree has unrelated untracked files (`.agents/`, `.claude/`, `.cortex/`, `skills-lock.json`) and an unrelated `CLAUDE.md` edit. Add files by explicit path.

## Review Focus

1. A stored value that is corrupt or from an older schema must fall back to an empty list, not crash the page (test in Task 3).
2. Starring a channel and clicking away within 500 ms must not lose the write (flush on `pagehide`, Task 7; `flush()` tested in Task 3).
3. A favorite whose channel no longer exists (API 404) must show an unknown dot, a usable "…" name and a working remove button (tests in Tasks 4 and 6).
4. Hostile API text (`<img onerror>` as a channel name, `javascript:` image URL) must render as inert text or no image (tests in Tasks 4 and 6).
5. Non-channel pages and URL variants (`/video/123`, `/`, `/live/{id}`, `/{id}/community`) must not show a star button or throw (test in Task 5).

## File Structure

```
wxt.config.ts                       modify: manifest block
package.json                        modify: name, description, test script, devDeps
vitest.config.ts                    create: WxtVitest + happy-dom
.github/workflows/ci.yml            create: compile, test, build
lib/selectors.ts                    create (Task 1): CHZZK selectors, values come from the spike
lib/favorites.ts                    create: types, pure ops, store, sync item, row builder
lib/chzzk-api.ts                    create: fetchChannel, pollOnce, startPolling, cache helpers
lib/dom-anchor.ts                   create: parseChannelId, rail + theme detection and watchers
components/Favorites.tsx            create: section UI (header, banner, empty, rows, rail)
components/StarButton.tsx           create: ☆ toggle
entrypoints/content/index.tsx       create: content script wiring (replaces entrypoints/content.ts)
entrypoints/content/hooks.ts        create: React hooks over store, poller, DOM watchers
entrypoints/content/style.css       create: component CSS using tokens only
entrypoints/content/tokens.css      create (Task 1): measured CSS variables, light + dark
tests/fixtures/*.html               create (Task 1): saved CHZZK DOM
docs/designs/chzzk-dom-findings.md  create (Task 1): measurements and decisions
tests/*.test.ts, lib/*.test.ts, components/*.test.tsx   tests next to what they test
delete: entrypoints/content.ts, entrypoints/background.ts, entrypoints/popup/, assets/react.svg, public/wxt.svg
```

`hooks.ts` is the one file beyond the 7-file arrangement approved in the eng review (D1): React glue that would otherwise bloat `index.tsx`.

---

### Task 1: Stage 0 spike, measure CHZZK and save fixtures

Manual work that needs a logged-in Chrome. Run it yourself, or have Claude drive it through the Chrome extension tools with your permission. Covers eng tasks T1 and T12 and design task DT1.

**Files:**
- Create: `docs/designs/chzzk-dom-findings.md`
- Create: `tests/fixtures/sidebar-expanded.html`, `tests/fixtures/sidebar-collapsed.html`, `tests/fixtures/channel-page.html`, `tests/fixtures/theme-dark.html`, `tests/fixtures/theme-light.html`
- Create: `lib/selectors.ts`, `entrypoints/content/tokens.css`
- Test: `tests/selectors.test.ts`, `tests/tokens.test.ts`

**Interfaces:**
- Produces: `SELECTORS: { followingList: string; channelFollowButton: string; sidebarCollapsed: string; themeDark: string }` in `lib/selectors.ts`; CSS variables listed in Step 7 in `tokens.css`; fixture files with the exact names above; a findings doc answering the questions in Step 8.

- [ ] **Step 1: Write the failing selector test**

```ts
// tests/selectors.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SELECTORS } from '../lib/selectors';

function load(name: string): Document {
  const html = readFileSync(`tests/fixtures/${name}`, 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

function count(doc: Document, selector: string): number {
  return selector ? doc.querySelectorAll(selector).length : 0;
}

describe('SELECTORS against saved CHZZK fixtures', () => {
  it('followingList matches exactly one element in the expanded sidebar', () => {
    expect(count(load('sidebar-expanded.html'), SELECTORS.followingList)).toBe(1);
  });

  it('followingList also matches exactly one element in the collapsed sidebar', () => {
    expect(count(load('sidebar-collapsed.html'), SELECTORS.followingList)).toBe(1);
  });

  it('sidebarCollapsed matches only the collapsed sidebar', () => {
    expect(count(load('sidebar-expanded.html'), SELECTORS.sidebarCollapsed)).toBe(0);
    expect(count(load('sidebar-collapsed.html'), SELECTORS.sidebarCollapsed)).toBeGreaterThan(0);
  });

  it('channelFollowButton matches exactly one element on a channel page', () => {
    expect(count(load('channel-page.html'), SELECTORS.channelFollowButton)).toBe(1);
  });

  it('themeDark matches the dark document and not the light one', () => {
    expect(count(load('theme-dark.html'), SELECTORS.themeDark)).toBeGreaterThan(0);
    expect(count(load('theme-light.html'), SELECTORS.themeDark)).toBe(0);
  });
});
```

```ts
// tests/tokens.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const GEOMETRY = ['--fav-row-h', '--fav-avatar', '--fav-font-size', '--fav-pad-x', '--fav-gap', '--fav-radius', '--fav-rail-w'];
const COLORS = ['--fav-bg', '--fav-fg', '--fav-fg-muted', '--fav-hover-bg', '--fav-accent', '--fav-focus', '--fav-error-bg', '--fav-error-fg'];
const css = () => readFileSync('entrypoints/content/tokens.css', 'utf8');
const defined = (name: string) => [...css().matchAll(new RegExp(`${name}\\s*:\\s*[^;\\s][^;]*;`, 'g'))].length;

describe('tokens.css', () => {
  it('defines every geometry token and the font family at least once', () => {
    for (const name of [...GEOMETRY, '--fav-font']) expect(defined(name), name).toBeGreaterThanOrEqual(1);
  });
  it('defines every color token for both light and dark', () => {
    for (const name of COLORS) expect(defined(name), name).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Create the empty selectors file so the test can fail for the right reason**

```ts
// lib/selectors.ts
export interface Selectors {
  /** The element the favorites section is inserted BEFORE (CHZZK's "팔로잉" list). */
  followingList: string;
  /** CHZZK's native follow button on a channel page; the star is inserted AFTER it. */
  channelFollowButton: string;
  /** Matches somewhere in the document only while the sidebar is collapsed to its rail. */
  sidebarCollapsed: string;
  /** Matches (usually the html element) only in dark theme. */
  themeDark: string;
}

export const SELECTORS: Selectors = {
  followingList: '',
  channelFollowButton: '',
  sidebarCollapsed: '',
  themeDark: '',
};
```

Create empty files `entrypoints/content/tokens.css` and one empty file per fixture so the tests can run.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/selectors.test.ts tests/tokens.test.ts` (Task 2 installs Vitest; if Task 2 is not done yet, do Task 2 first)
Expected: FAIL (selectors match 0 elements, tokens undefined).

- [ ] **Step 4: Save fixtures from the live site (logged in, desktop Chrome, window about 1440 px wide)**

For each fixture, open DevTools on chzzk.naver.com, inspect the target, and copy HTML with the console:

```js
// sidebar-expanded.html, sidebar-collapsed.html: select the whole left sidebar element in the Elements panel first, then:
copy($0.outerHTML)
// channel-page.html: open any live channel page (/live/{id}); select the element that contains the channel header and the follow button:
copy($0.outerHTML)
// theme-dark.html / theme-light.html: switch theme in CHZZK settings, then:
copy('<!doctype html>' + document.documentElement.outerHTML.slice(0, document.documentElement.outerHTML.indexOf('>') + 1) + '<body></body></html>')
```

Paste each into its file under `tests/fixtures/`. If the dark marker is on `body` rather than `html`, copy the body opening tag too, keeping the same file names.

- [ ] **Step 5: Choose selectors and write them into `lib/selectors.ts`**

Prefer stable hooks in this order: `id`, `role`/`aria-label`, `data-*`, class-name prefixes (`[class^="navigation_"]`) over full hashed class names. Each selector must pass `tests/selectors.test.ts`. If one `followingList` selector cannot match both the expanded and collapsed sidebars, stop and add a second key to `Selectors` (for example `followingListCollapsed`) plus a test row, and record why in the findings doc.

- [ ] **Step 6: Measure tokens**

Select the favorites-like row (a native following row), the avatar, and the sidebar in turn and run:

```js
const r = $0.getBoundingClientRect();
const cs = getComputedStyle($0);
copy(JSON.stringify({ w: r.width, h: r.height, font: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight, color: cs.color, bg: cs.backgroundColor, padL: cs.paddingLeft, gap: cs.columnGap, radius: cs.borderRadius }, null, 2))
```

Do it in light and dark theme and with the sidebar collapsed (record the rail width). Also record the live indicator color and the focus ring color CHZZK uses.

- [ ] **Step 7: Write `entrypoints/content/tokens.css`**

Use exactly these variable names (components in Task 6 use only these):

```css
.fav-root {
  --fav-font: <font-family from Step 6>;
  --fav-row-h: <native row height, px>;
  --fav-avatar: <native avatar size, px>;
  --fav-font-size: <native name font size>;
  --fav-pad-x: <native row left padding>;
  --fav-gap: <native avatar-to-name gap>;
  --fav-radius: <native row hover radius>;
  --fav-rail-w: <collapsed rail width, px>;
  --fav-bg: <light bg>;
  --fav-fg: <light text>;
  --fav-fg-muted: <light secondary text>;
  --fav-hover-bg: <light row hover bg>;
  --fav-accent: <live indicator color, light>;
  --fav-focus: <focus ring color, light>;
  --fav-error-bg: <error banner bg, light>;
  --fav-error-fg: <error banner text, light>;
}
.fav-root[data-theme='dark'] {
  --fav-bg: <dark bg>;
  --fav-fg: <dark text>;
  --fav-fg-muted: <dark secondary text>;
  --fav-hover-bg: <dark row hover bg>;
  --fav-accent: <live indicator color, dark>;
  --fav-focus: <focus ring color, dark>;
  --fav-error-bg: <error banner bg, dark>;
  --fav-error-fg: <error banner text, dark>;
}
```

Replace every `<...>` with the measured literal value. Body text color against `--fav-bg` must be at least 4.5:1 in both themes; if the native value is lower, pick the nearest value that passes and note it in the findings doc.

- [ ] **Step 8: Write `docs/designs/chzzk-dom-findings.md` answering, with evidence**

1. Follow-button anchor and where the star goes (matches design review 7B).
2. How CHZZK marks dark theme and the collapsed rail (which element, attribute or class).
3. Channel URL patterns that mean "this page is a channel" (for `parseChannelId` in Task 5); list every pattern seen.
4. T12: on a channel page run in the console `history.pushState(null, '', '/<another-channel-id>'); dispatchEvent(new PopStateEvent('popstate'))` and record whether CHZZK navigated. Only record the result; reopening R8 is a separate decision.
5. Whether the sidebar element is present on first paint or appears later (the content script must wait via `autoMount`).
6. The measured token table from Step 6.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run tests/selectors.test.ts tests/tokens.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 10: Commit**

```bash
git add docs/designs/chzzk-dom-findings.md tests/fixtures lib/selectors.ts entrypoints/content/tokens.css tests/selectors.test.ts tests/tokens.test.ts
git commit -m "docs: record CHZZK DOM findings, fixtures, selectors and tokens"
```

---

### Task 2: Tooling, manifest and starter cleanup

**Files:**
- Modify: `package.json`, `wxt.config.ts`
- Create: `vitest.config.ts`, `.github/workflows/ci.yml`, `tests/smoke.test.ts`
- Delete: `entrypoints/content.ts`, `entrypoints/background.ts`, `entrypoints/popup/`, `assets/react.svg`, `public/wxt.svg`

**Interfaces:**
- Produces: `npm test` runs Vitest with `WxtVitest()` and happy-dom; `globals: true`; tests may import `fakeBrowser` from `wxt/testing/fake-browser`; `storage` from `#imports`.

- [ ] **Step 1: Install dev dependencies**

Run: `npm install -D vitest happy-dom @testing-library/react @testing-library/dom`
Expected: installs; `package-lock.json` is created.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['lib/**/*.test.ts', 'components/**/*.test.tsx', 'entrypoints/**/*.test.tsx', 'tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Write the failing smoke test**

```ts
// tests/smoke.test.ts
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
```

- [ ] **Step 4: Run the smoke test**

Run: `npx vitest run tests/smoke.test.ts`
Expected: PASS. This is a tooling check rather than red-green TDD. If it fails with a resolve or plugin error (`#imports`, `wxt/testing/...`), fix `vitest.config.ts` or the import paths against the installed WXT version until it passes.

- [ ] **Step 5: Update `package.json`, `wxt.config.ts`, remove starter files**

In `package.json` set `"name": "chzzk-favorites"`, `"description": "치지직 사이드바 팔로잉 위에 나만의 즐겨찾기 목록을 추가합니다."`, and add to `scripts`: `"test": "vitest run"`.

```ts
// wxt.config.ts
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'CHZZK 즐겨찾기',
    description: '치지직 사이드바 팔로잉 위에 나만의 즐겨찾기 목록을 추가합니다.',
    permissions: ['storage'],
  },
});
```

Run: `git rm -r entrypoints/popup entrypoints/background.ts entrypoints/content.ts assets/react.svg public/wxt.svg`

Create a temporary content entrypoint so the build still has one (replaced in Task 7):

```ts
// entrypoints/content/index.tsx
export default defineContentScript({
  matches: ['*://chzzk.naver.com/*'],
  main() {},
});
```

- [ ] **Step 6: Create `.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push:
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run compile
      - run: npm test
      - run: npm run build
```

- [ ] **Step 7: Run everything**

Run: `npm run compile && npm test && npm run build`
Expected: compile clean; smoke test PASS; build succeeds and `.output/chrome-mv3/manifest.json` lists `permissions: ["storage"]` and no `host_permissions`. (Tests from Task 1 fail until their fixtures and selectors exist; if Task 1 is not done, run `npx vitest run tests/smoke.test.ts` instead and expect PASS.)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json wxt.config.ts vitest.config.ts .github/workflows/ci.yml tests/smoke.test.ts entrypoints/content/index.tsx
git commit -m "chore: add Vitest tooling, manifest, CI; remove WXT starter files"
```

---

### Task 3: Favorites model, store and synced item

**Files:**
- Create: `lib/favorites.ts`
- Test: `lib/favorites.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (`LiveStatus` is defined here; Task 4 imports it).
- Produces (exact):
  - `type LiveStatus = 'live' | 'offline' | 'unknown'`
  - `interface FavoriteItem { channelId: string; groupId: string | null }`
  - `interface FavoriteGroup { id: string; name: string; collapsed: boolean }`
  - `interface FavoritesData { collapsed: boolean; groups: FavoriteGroup[]; items: FavoriteItem[] }`
  - `const EMPTY_FAVORITES: FavoritesData`
  - `normalizeFavorites(raw: unknown): FavoritesData`
  - `isFavorite(data, channelId): boolean`, `addFavorite(data, channelId): FavoritesData`, `removeFavorite(data, channelId): FavoritesData`, `toggleSectionCollapsed(data): FavoritesData`
  - `interface CachedChannel { name: string | null; imageUrl: string | null }`
  - `interface RowData { channelId: string; name: string | null; imageUrl: string | null; status: LiveStatus | null }` (`null` = still loading)
  - `buildRows(items: FavoriteItem[], cache: Record<string, CachedChannel>, status: Record<string, LiveStatus>): RowData[]`
  - `type SaveStatus = 'ok' | 'error'`; `interface FavoritesState { data: FavoritesData; saveStatus: SaveStatus }`
  - `interface StoreDeps { load: () => Promise<unknown>; save: (d: FavoritesData) => Promise<void>; watch?: (cb: (raw: unknown) => void) => () => void; delayMs?: number }`
  - `interface FavoritesStore { getState(): FavoritesState; subscribe(l: () => void): () => void; add(id: string): void; remove(id: string): void; toggleCollapsed(): void; flush(): Promise<void>; dispose(): void }`
  - `createFavoritesStore(deps: StoreDeps): Promise<FavoritesStore>`
  - `favoritesItem` (WXT `sync:favorites`, version 1), `createDefaultStore(opts?: { delayMs?: number }): Promise<FavoritesStore>`

- [ ] **Step 1: Write the failing tests**

```ts
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
    expect(save.mock.calls[0][0].items).toEqual([{ channelId: ID_B, groupId: null }]);
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
    expect(save.mock.calls[1][0].items).toHaveLength(2);
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/favorites.test.ts`
Expected: FAIL, cannot resolve `./favorites`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/favorites.test.ts`
Expected: PASS (all tests). Then `npm run compile` Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/favorites.ts lib/favorites.test.ts
git commit -m "feat: add favorites model, coalescing store and sync:favorites item"
```

---

### Task 4: CHZZK live status client and poller

**Files:**
- Create: `lib/chzzk-api.ts`
- Test: `lib/chzzk-api.test.ts`

**Interfaces:**
- Consumes: `LiveStatus`, `CachedChannel` from `lib/favorites.ts` (Task 3).
- Produces (exact):
  - `interface ChannelInfo { channelId: string; name: string | null; imageUrl: string | null; status: LiveStatus }`
  - `fetchChannel(channelId: string, fetchFn?: typeof fetch): Promise<ChannelInfo>` (never rejects)
  - `pollOnce(ids: string[], fetchOne: (id: string) => Promise<ChannelInfo>, concurrency?: number): Promise<ChannelInfo[]>` (same order as `ids`)
  - `mergeCache(prev: Record<string, CachedChannel>, results: ChannelInfo[]): Record<string, CachedChannel>`
  - `mergeStatus(prev: Record<string, LiveStatus>, results: ChannelInfo[]): Record<string, LiveStatus>`
  - `pruneRecord<T>(rec: Record<string, T>, keepIds: string[]): Record<string, T>`
  - `interface PollerDeps { getIds(): string[]; onResults(r: ChannelInfo[]): void; fetchOne?(id: string): Promise<ChannelInfo>; intervalMs?: number; concurrency?: number; doc?: PollerDoc }`, `interface PollerDoc { visibilityState: DocumentVisibilityState; addEventListener(t: 'visibilitychange', cb: () => void): void; removeEventListener(t: 'visibilitychange', cb: () => void): void }`
  - `interface Poller { stop(): void; refresh(): void }`, `startPolling(deps: PollerDeps): Poller`
  - `channelCacheItem` (`local:channelCache`, `Record<string, CachedChannel>`), `loadChannelCache(): Promise<Record<string, CachedChannel>>`, `saveChannelCache(c: Record<string, CachedChannel>): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/chzzk-api.test.ts
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
  vi.fn(async () => ({ ok: true, json: async () => ({ code: 200, content }) }) as unknown as Response);

describe('fetchChannel', () => {
  it('maps openLive true to live and keeps name and https image', async () => {
    const f = ok({ channelName: '한동숙', channelImageUrl: 'https://img/x.png', openLive: true });
    expect(await fetchChannel(ID, f)).toEqual({ channelId: ID, name: '한동숙', imageUrl: 'https://img/x.png', status: 'live' });
    expect(f.mock.calls[0][0]).toBe(`https://api.chzzk.naver.com/service/v1/channels/${ID}`);
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
    expect(onResults.mock.calls[1][0].map((r: ChannelInfo) => r.channelId)).toEqual(['a', 'b']);
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/chzzk-api.test.ts`
Expected: FAIL, cannot resolve `./chzzk-api`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/chzzk-api.ts
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
      out[i] = await fetchOne(ids[i]);
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/chzzk-api.test.ts && npm run compile`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/chzzk-api.ts lib/chzzk-api.test.ts
git commit -m "feat: add CHZZK live status client, poller and channel cache"
```

---

### Task 5: DOM helpers (channel id, theme, rail)

Depends on Task 1 (`lib/selectors.ts`, fixtures) and Task 2 (tooling). Unit tests here mock `./selectors`, so they do not depend on the measured values; Task 1's `tests/selectors.test.ts` ties the real values to fixtures. If Task 1 findings list extra channel URL patterns, add each as a row in the first test before changing the regex.

**Files:**
- Create: `lib/dom-anchor.ts`
- Test: `lib/dom-anchor.test.ts`

**Interfaces:**
- Consumes: `SELECTORS` from `lib/selectors.ts` (`sidebarCollapsed`, `themeDark`).
- Produces: `parseChannelId(pathname: string): string | null`; `isRailCollapsed(doc: Document): boolean`; `isDarkTheme(doc: Document): boolean`; `watchRail(doc: Document, cb: (collapsed: boolean) => void): () => void` (calls `cb` once immediately); `watchTheme(doc: Document, cb: (theme: 'light' | 'dark') => void): () => void` (calls `cb` once immediately).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/dom-anchor.test.ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/dom-anchor.test.ts`
Expected: FAIL, cannot resolve `./dom-anchor`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/dom-anchor.ts
import { SELECTORS } from './selectors';

/** 32 hex characters, optionally behind /live/, optionally followed by a sub-path. */
const CHANNEL_PATH = /^\/(?:live\/)?([0-9a-f]{32})(?:\/.*)?$/;

export function parseChannelId(pathname: string): string | null {
  const m = CHANNEL_PATH.exec(pathname);
  return m ? m[1] : null;
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
```

Note: observing `childList` + `subtree` on `documentElement` fires often on a React SPA, but the callback only does a `querySelector` once per animation frame; if measurement in Task 8 shows a cost, narrow `options` to the attributes the findings doc names.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/dom-anchor.test.ts && npm run compile`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/dom-anchor.ts lib/dom-anchor.test.ts
git commit -m "feat: add channel id parsing and theme/rail detection"
```

---

### Task 6: Favorites and StarButton components with styles

Depends on Task 3 (`RowData`) and Task 1 (`tokens.css`).

**Files:**
- Create: `components/Favorites.tsx`, `components/StarButton.tsx`, `entrypoints/content/style.css`
- Test: `components/Favorites.test.tsx`, `components/StarButton.test.tsx`

**Interfaces:**
- Consumes: `RowData` from `lib/favorites.ts`.
- Produces: `Favorites(props: FavoritesProps)` with `FavoritesProps { rows: RowData[]; collapsed: boolean; saveFailed: boolean; rail: boolean; onToggleCollapsed(): void; onRemove(channelId: string): void }`; `StarButton(props: { channelId: string | null; isFavorite: boolean; onToggle(channelId: string): void })` (renders nothing when `channelId` is null). CSS class names: `fav-root` (set by the content script wrapper), `fav-nav`, `fav-header`, `fav-list`, `fav-row`, `fav-link`, `fav-avatar`, `fav-name`, `fav-name-live`, `fav-dot`, `fav-dot-live`, `fav-dot-unknown`, `fav-remove`, `fav-banner`, `fav-empty`, `fav-sr`, `fav-star`.

- [ ] **Step 1: Write the failing component tests**

```tsx
// components/Favorites.test.tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Favorites, type FavoritesProps } from './Favorites';
import type { RowData } from '../lib/favorites';

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const C = 'c'.repeat(32);
const row = (over: Partial<RowData> = {}): RowData => ({ channelId: A, name: '한동숙', imageUrl: null, status: 'offline', ...over });

const setup = (over: Partial<FavoritesProps> = {}) => {
  const props: FavoritesProps = {
    rows: [row()],
    collapsed: false,
    saveFailed: false,
    rail: false,
    onToggleCollapsed: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  };
  return { ...render(<Favorites {...props} />), props };
};

describe('Favorites', () => {
  it('is a navigation landmark labelled 즐겨찾기 with a count and one link per row', () => {
    setup({ rows: [row(), row({ channelId: B, name: '침착맨' })] });
    const nav = screen.getByRole('navigation', { name: '즐겨찾기' });
    expect(within(nav).getByRole('button', { expanded: true }).textContent).toContain('2');
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([`/${A}`, `/${B}`]);
  });

  it('marks a live row with a labelled dot and a live name class', () => {
    setup({ rows: [row({ status: 'live' })] });
    expect(screen.getByRole('img', { name: '방송 중' })).toBeTruthy();
    expect(screen.getByText('한동숙').className).toContain('fav-name-live');
  });

  it('announces offline as text, unknown as a labelled dot, and shows nothing while loading', () => {
    setup({ rows: [row({ status: 'offline' }), row({ channelId: B, status: 'unknown' }), row({ channelId: C, status: null })] });
    expect(screen.getByText('방송 안 함')).toBeTruthy();
    expect(screen.getByRole('img', { name: '상태 알 수 없음' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')[2].querySelector('.fav-dot, .fav-sr:not(.fav-name)')).toBeNull();
  });

  it('shows the exact empty hint and no list when there are no favorites', () => {
    setup({ rows: [] });
    expect(screen.getByText('채널 페이지의 ☆를 눌러 추가하세요')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('hides rows and the hint when collapsed and toggles through the header', () => {
    const { props } = setup({ collapsed: true });
    expect(screen.queryByRole('list')).toBeNull();
    const header = screen.getByRole('button', { expanded: false });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(header);
    expect(props.onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('shows the exact banner as an alert when saving failed', () => {
    setup({ saveFailed: true });
    expect(screen.getByRole('alert').textContent).toBe('저장하지 못했어요. 즐겨찾기가 다른 기기에 반영되지 않을 수 있어요.');
  });

  it('has a remove button named after the channel that calls onRemove with its id', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: '한동숙 즐겨찾기에서 제거' }));
    expect(props.onRemove).toHaveBeenCalledWith(A);
  });

  it('still renders a usable row for a channel with no known name', () => {
    const { props } = setup({ rows: [row({ name: null, status: 'unknown' })] });
    expect(screen.getByText('…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `${A} 즐겨찾기에서 제거` }));
    expect(props.onRemove).toHaveBeenCalledWith(A);
  });

  it('renders hostile names as inert text', () => {
    const { container } = setup({ rows: [row({ name: '<img src="x" onerror="alert(1)">' })] });
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText('<img src="x" onerror="alert(1)">')).toBeTruthy();
  });

  it('renders the avatar lazily with empty alt when an image url exists', () => {
    const { container } = setup({ rows: [row({ imageUrl: 'https://img/a.png' })] });
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://img/a.png');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('rail mode shows avatars only: no header, no remove buttons, name as title', () => {
    setup({ rail: true, rows: [row({ status: 'live' })] });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link').getAttribute('title')).toBe('한동숙');
    expect(screen.getByRole('img', { name: '방송 중' })).toBeTruthy();
  });

  it('rail mode with no favorites renders no hint', () => {
    setup({ rail: true, rows: [] });
    expect(screen.queryByText('채널 페이지의 ☆를 눌러 추가하세요')).toBeNull();
  });
});
```

```tsx
// components/StarButton.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StarButton } from './StarButton';

const ID = 'a'.repeat(32);

describe('StarButton', () => {
  it('renders nothing without a channel id', () => {
    const { container } = render(<StarButton channelId={null} isFavorite={false} onToggle={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('offers to add when not a favorite', () => {
    const onToggle = vi.fn();
    render(<StarButton channelId={ID} isFavorite={false} onToggle={onToggle} />);
    const b = screen.getByRole('button', { name: '즐겨찾기에 추가' });
    expect(b.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(b);
    expect(onToggle).toHaveBeenCalledWith(ID);
  });

  it('offers to remove when it is a favorite', () => {
    render(<StarButton channelId={ID} isFavorite onToggle={vi.fn()} />);
    const b = screen.getByRole('button', { name: '즐겨찾기에서 제거' });
    expect(b.getAttribute('aria-pressed')).toBe('true');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components`
Expected: FAIL, cannot resolve `./Favorites` and `./StarButton`.

- [ ] **Step 3: Write the components**

```tsx
// components/Favorites.tsx
import type { RowData } from '../lib/favorites';

const LABEL = { live: '방송 중', offline: '방송 안 함', unknown: '상태 알 수 없음' } as const;

export interface FavoritesProps {
  rows: RowData[];
  collapsed: boolean;
  saveFailed: boolean;
  rail: boolean;
  onToggleCollapsed(): void;
  onRemove(channelId: string): void;
}

function StatusDot({ status }: { status: RowData['status'] }) {
  if (status === null) return null;
  if (status === 'offline') return <span className="fav-sr">{LABEL.offline}</span>;
  return <span className={`fav-dot fav-dot-${status}`} role="img" aria-label={LABEL[status]} />;
}

function Row({ row, rail, onRemove }: { row: RowData; rail: boolean; onRemove(id: string): void }) {
  const label = row.name ?? '…';
  return (
    <li className="fav-row">
      <a className="fav-link" href={`/${row.channelId}`} title={rail ? label : undefined}>
        {row.imageUrl ? (
          <img className="fav-avatar" src={row.imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="fav-avatar" aria-hidden="true" />
        )}
        {rail ? (
          <span className="fav-sr">{label}</span>
        ) : (
          <span className={row.status === 'live' ? 'fav-name fav-name-live' : 'fav-name'}>{label}</span>
        )}
        <StatusDot status={row.status} />
      </a>
      {!rail && (
        <button
          type="button"
          className="fav-remove"
          aria-label={`${row.name ?? row.channelId} 즐겨찾기에서 제거`}
          onClick={() => onRemove(row.channelId)}
        >
          ✕
        </button>
      )}
    </li>
  );
}

export function Favorites({ rows, collapsed, saveFailed, rail, onToggleCollapsed, onRemove }: FavoritesProps) {
  const showBody = rail || !collapsed;
  return (
    <nav className={rail ? 'fav-nav fav-rail' : 'fav-nav'} aria-label="즐겨찾기">
      {!rail && (
        <button type="button" className="fav-header" aria-expanded={!collapsed} onClick={onToggleCollapsed}>
          <span className="fav-title">즐겨찾기</span>
          <span className="fav-count">{rows.length}</span>
          <span className="fav-chevron" aria-hidden="true">
            {collapsed ? '⌄' : '⌃'}
          </span>
        </button>
      )}
      {saveFailed && (
        <p className="fav-banner" role="alert">
          저장하지 못했어요. 즐겨찾기가 다른 기기에 반영되지 않을 수 있어요.
        </p>
      )}
      {showBody &&
        (rows.length === 0 ? (
          rail ? null : <p className="fav-empty">채널 페이지의 ☆를 눌러 추가하세요</p>
        ) : (
          <ul className="fav-list">
            {rows.map((r) => (
              <Row key={r.channelId} row={r} rail={rail} onRemove={onRemove} />
            ))}
          </ul>
        ))}
    </nav>
  );
}
```

```tsx
// components/StarButton.tsx
export interface StarButtonProps {
  channelId: string | null;
  isFavorite: boolean;
  onToggle(channelId: string): void;
}

export function StarButton({ channelId, isFavorite, onToggle }: StarButtonProps) {
  if (channelId === null) return null;
  return (
    <button
      type="button"
      className="fav-star"
      aria-pressed={isFavorite}
      aria-label={isFavorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}
      onClick={() => onToggle(channelId)}
    >
      {isFavorite ? '★' : '☆'}
    </button>
  );
}
```

- [ ] **Step 4: Write `entrypoints/content/style.css` (variables only, no literals for sizes or colors)**

```css
@import './tokens.css';

.fav-root { font-family: var(--fav-font); font-size: var(--fav-font-size); color: var(--fav-fg); background: var(--fav-bg); }
.fav-nav { display: block; }
.fav-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.fav-header { display: flex; align-items: center; gap: var(--fav-gap); width: 100%; min-height: var(--fav-row-h); padding: 0 var(--fav-pad-x); border: 0; background: transparent; color: inherit; font: inherit; font-weight: 700; cursor: pointer; text-align: left; }
.fav-count { color: var(--fav-fg-muted); font-weight: 400; }
.fav-chevron { margin-left: auto; color: var(--fav-fg-muted); }
.fav-header:hover, .fav-link:hover { background: var(--fav-hover-bg); }

.fav-list { list-style: none; margin: 0; padding: 0; }
.fav-row { position: relative; display: flex; align-items: center; }
.fav-link { display: flex; align-items: center; gap: var(--fav-gap); flex: 1; min-width: 0; min-height: var(--fav-row-h); padding: 0 var(--fav-pad-x); border-radius: var(--fav-radius); color: inherit; text-decoration: none; }
.fav-avatar { flex: none; width: var(--fav-avatar); height: var(--fav-avatar); border-radius: 50%; background: var(--fav-hover-bg); object-fit: cover; }
.fav-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fav-name-live { font-weight: 700; }

.fav-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
.fav-dot-live { background: var(--fav-accent); }
.fav-dot-unknown { box-sizing: border-box; border: 1px solid var(--fav-fg-muted); background: transparent; }

.fav-remove { position: absolute; right: var(--fav-pad-x); display: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: var(--fav-radius); background: transparent; color: var(--fav-fg-muted); cursor: pointer; }
.fav-row:hover .fav-remove, .fav-row:focus-within .fav-remove { display: block; }
.fav-row:hover .fav-link, .fav-row:focus-within .fav-link { padding-right: calc(var(--fav-pad-x) + 24px + var(--fav-gap)); }

.fav-header:focus-visible, .fav-link:focus-visible, .fav-remove:focus-visible, .fav-star:focus-visible { outline: 2px solid var(--fav-focus); outline-offset: -2px; }

.fav-banner { margin: 0; padding: 8px var(--fav-pad-x); background: var(--fav-error-bg); color: var(--fav-error-fg); }
.fav-empty { margin: 0; padding: 8px var(--fav-pad-x); color: var(--fav-fg-muted); }

.fav-rail .fav-list { width: var(--fav-rail-w); }
.fav-rail .fav-link { justify-content: center; padding: 0; }
.fav-rail .fav-dot { position: absolute; right: 4px; bottom: 4px; }

.fav-star { display: inline-flex; align-items: center; justify-content: center; min-width: 32px; min-height: 32px; padding: 0 8px; border: 0; border-radius: var(--fav-radius); background: transparent; color: var(--fav-fg); font: inherit; cursor: pointer; }
.fav-star:hover { background: var(--fav-hover-bg); }
```

- [ ] **Step 5: Run to verify tests pass**

Run: `npx vitest run components && npm run compile`
Expected: PASS and no type errors. Pixel-level fidelity (spacing, hover reveal, rail width, 47-character name ellipsis) is checked by eye in Task 7 Step 6; happy-dom cannot test layout.

- [ ] **Step 6: Commit**

```bash
git add components entrypoints/content/style.css
git commit -m "feat: add Favorites and StarButton components with token-based styles"
```

---

### Task 7: Content script wiring, build and manual QA

Depends on Tasks 1 to 6.

**Files:**
- Create: `entrypoints/content/hooks.ts`
- Modify: `entrypoints/content/index.tsx` (replace the Task 2 stub)
- Test: `entrypoints/content/hooks.test.tsx`

**Interfaces:**
- Consumes: `createDefaultStore`, `FavoritesStore`, `FavoritesState`, `buildRows`, `RowData`, `CachedChannel`, `LiveStatus` (Task 3); `startPolling`, `mergeCache`, `mergeStatus`, `pruneRecord`, `loadChannelCache`, `saveChannelCache`, `Poller` (Task 4); `parseChannelId`, `watchRail`, `watchTheme` (Task 5); `Favorites`, `StarButton` (Task 6); `SELECTORS` (Task 1).
- Produces: `useFavorites(store): FavoritesState`; `useRows(store): RowData[]`; `useRail(): boolean`; `useChannelId(subscribe: (cb: () => void) => () => void, getPath?: () => string): string | null`.

- [ ] **Step 1: Write the failing hook tests**

```tsx
// entrypoints/content/hooks.test.tsx
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run entrypoints/content/hooks.test.tsx`
Expected: FAIL, cannot resolve `./hooks`.

- [ ] **Step 3: Write `hooks.ts`**

```ts
// entrypoints/content/hooks.ts
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { loadChannelCache, mergeCache, mergeStatus, pruneRecord, saveChannelCache, startPolling, type Poller } from '../../lib/chzzk-api';
import { parseChannelId, watchRail } from '../../lib/dom-anchor';
import { buildRows, type CachedChannel, type FavoritesState, type FavoritesStore, type LiveStatus, type RowData } from '../../lib/favorites';

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

  return useMemo(() => buildRows(state.data.items, cache, status), [state.data.items, cache, status]);
}
```

- [ ] **Step 4: Run to verify the hook tests pass**

Run: `npx vitest run entrypoints/content/hooks.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write `entrypoints/content/index.tsx`**

```tsx
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
```

Notes for the executor: confirm in the generated `.wxt` types that `createShadowRootUi` options accept `append: 'before' | 'after'` and that `ctx.addEventListener(window, 'wxt:locationchange', cb)` is valid; if `tsc` complains, check `node_modules/wxt` type docs and adapt only the type usage, keeping behavior. `ctx.addEventListener` removes its listeners when the extension context is invalidated.

- [ ] **Step 6: Verify build, tests and the real site**

Run: `npm run compile && npm test && npm run build`
Expected: all PASS; `.output/chrome-mv3/manifest.json` has `permissions: ["storage"]`, `content_scripts[0].matches: ["*://chzzk.naver.com/*"]`, no `host_permissions`.

Then load `.output/chrome-mv3` via `chrome://extensions` (Developer mode, Load unpacked) and check on chzzk.naver.com, logged in. Tick each:

- [ ] The "즐겨찾기" section sits directly above the native following list, same row height, font and colors as native rows at 100% zoom, in light and dark theme.
- [ ] Empty state shows `채널 페이지의 ☆를 눌러 추가하세요`.
- [ ] On a channel page a ☆ appears right after the native follow button; click makes it ★ and the row appears at the top of the section within about 1 s with name and avatar.
- [ ] Reload: the favorite persists; the dot is empty first, then green for a live channel; offline has no dot.
- [ ] Block `api.chzzk.naver.com` (DevTools > Network request blocking) and reload: dots show the hollow unknown marker, no crash.
- [ ] Hover a row: ✕ appears and the dot shifts left; Tab reaches ✕; clicking removes the row and ☆ turns back on the channel page.
- [ ] Click a row: the channel opens (plain full-page load); middle-click opens a new tab.
- [ ] Collapse the section via the header, reload: it stays collapsed.
- [ ] Collapse CHZZK's sidebar to its rail: the section becomes avatars only with a corner dot; expand: it returns.
- [ ] Navigate between channels and pages with the SPA: exactly one section, ☆ matches the current channel, no duplicates.
- [ ] Click ☆ then immediately click a favorite row within 500 ms; come back: the star change was saved.
- [ ] Add a channel with a name of about 47 characters (or edit a cached name in DevTools): the name is truncated with an ellipsis, the row height does not change.
- [ ] Open the same Chrome profile on a second machine or Chrome profile with sync: the list appears (chrome.storage.sync).
- [ ] Keyboard only: Tab through header, rows, ✕, ☆; focus ring visible everywhere; screen reader (VoiceOver) announces "즐겨찾기, navigation", dot states by text.

Record failures as new tasks; do not patch around them silently.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/content/hooks.ts entrypoints/content/hooks.test.tsx entrypoints/content/index.tsx
git commit -m "feat: wire favorites section and star button into the CHZZK content script"
```

---

## Out of scope for this plan (separate plans or TODOS.md)

- Stage 2: group create/rename/delete menus and their pure functions and tests (group delete moves channels to ungrouped, E2), drag reorder (dnd-kit, shadow-root spike first, native HTML5 fallback), per-group collapse.
- Weekly API shape canary (tracked in `TODOS.md`).
- SPA-style row navigation (R8 option B), only after Task 1's router test and a new decision.
- Firefox build and Chrome Web Store listing.
