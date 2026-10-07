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
