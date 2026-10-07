export interface Selectors {
  /** The element the favorites section is inserted BEFORE (CHZZK's "팔로우" nav). */
  followingList: string;
  /** Wrapper of CHZZK's native follow button on a channel page; the star is inserted AFTER it. */
  channelFollowButton: string;
  /** Matches somewhere in the document only while the sidebar is collapsed to its rail. */
  sidebarCollapsed: string;
  /** Matches (usually the html element) only in dark theme. */
  themeDark: string;
}

// CHZZK uses CSS-module class names (`_name_<hash>_<n>`); the hash changes on deploys,
// so match on the stable `_name_` fragment or on aria/id hooks instead.
export const SELECTORS: Selectors = {
  followingList: '#sidebar nav[aria-label="팔로우"]',
  channelFollowButton: '[class*="_has_tooltip_box_"]',
  sidebarCollapsed: '#sidebar:not([class*="_is_expanded_"])',
  themeDark: 'html[data-theme="theme_dark"]',
};
