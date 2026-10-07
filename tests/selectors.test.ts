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
