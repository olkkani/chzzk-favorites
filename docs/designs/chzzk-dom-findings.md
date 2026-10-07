# CHZZK DOM findings (Stage 0)

Measured on chzzk.naver.com, desktop Chrome, logged in, window about 1440 px wide. Fixtures are in `tests/fixtures/`.

## 1. Follow-button anchor and star placement

The channel header has `div[class*="_has_tooltip_box_"]` wrapping the native follow button (inside `[class*="_control_"]`, next to the alarm button). `SELECTORS.channelFollowButton` matches that wrapper (exactly one on the fixture); the star is inserted after it. Class names are CSS-module hashes (`_name_<hash>_<n>`), so selectors use the stable `_name_` fragment only.

## 2. Dark theme and collapsed rail

- Dark theme: `<html data-theme="theme_dark" class="theme_dark">`; light is `data-theme="light"`. Selector: `html[data-theme="theme_dark"]`.
- Collapsed rail: `#sidebar` loses its `_is_expanded_` class (the inner `nav`s lose it too). Selector: `#sidebar:not([class*="_is_expanded_"])`.
- Following list: `#sidebar nav[aria-label="팔로우"]` matches exactly one element in both expanded and collapsed fixtures, so no second key was needed. The collapsed nav has no header and shows avatars only.

## 3. Channel URL patterns seen

- `/{channelId}`: channel home; also the `href` of header thumbnail and name links.
- `/live/{channelId}`: live broadcast page; sidebar rows for live channels link here.
- Not channel pages (no star): `/`, `/lives`, `/clips`, `/video/{id}`.
- Not verified: `/{channelId}/community` and other sub-paths; `parseChannelId` treats only the two patterns above as channel pages.

## 4. T12: does CHZZK react to `pushState` + `popstate`?

Yes. `history.pushState(null, '', '/live/<other id>'); dispatchEvent(new PopStateEvent('popstate'))` navigated the page. Use `/live/<id>` to land on a live broadcast screen. Result recorded only; reopening R8 is a separate decision.

## 5. Sidebar on first paint

Not measured. The fixtures show the sidebar rendered after load; the content script must wait for `SELECTORS.followingList` via `autoMount` rather than assume it exists.

## 6. Measured tokens

| Token | Value | Source |
|---|---|---|
| font | Pretendard Variable stack | row computed style |
| row height / width | 42 px / 200 px | row |
| font size / weight | 14 px / 400 | row |
| left padding | 6 px | row |
| radius | 8 px | row |
| avatar | 26 px | img |
| avatar to name gap | 15 px | measured |
| sidebar width | 240 px expanded, 82 px rail | `#sidebar` |
| background | dark `rgb(20, 21, 23)`, light `rgb(255, 255, 255)` | nearest opaque ancestor (the `#sidebar` itself is transparent) |
| name color | dark `rgb(223, 226, 234)`, light `rgb(32, 34, 36)` | name element |
| focus ring | dark white, light black | live-ring border, not the real focus ring |

Estimated, not measured (marked `est.` in `tokens.css`): muted text, row hover background, live dot color, error banner colors. Contrast of `--fav-fg` on `--fav-bg`: about 15:1 light, 13:1 dark (above 4.5:1).
