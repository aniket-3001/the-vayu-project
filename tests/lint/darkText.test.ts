import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * `--ink` is a fixed dark slate: the dark look (src/theme/dark.css) changes `--text` and `--card` but not `--ink`, so
 * dark `--ink` text on a `--card` background is unreadable at night (the Add device button looked disabled).
 * A rule that sets `background: var(--card)` must take its text colour from `--text`.
 */
describe('dark look: text on cards', () => {
  const css = readFileSync('apps/web/src/styles.css', 'utf8');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((m) => ({
    selector: (m[1] ?? '').trim().split('\n').pop()?.trim() ?? '',
    body: m[2] ?? '',
  }));

  it('never puts --ink text on a --card background', () => {
    const bad = rules
      .filter(
        (r) =>
          /background:\s*var\(--card\)/u.test(r.body) &&
          /(^|[\s;])color:\s*var\(--ink\)/u.test(r.body),
      )
      .map((r) => r.selector);
    expect(bad).toEqual([]);
  });

  it('the Add device button takes its text from --text, like the account button beside it', () => {
    const rule = rules.find((r) => r.selector === '.add-device-button');
    expect(rule?.body).toMatch(/color:\s*var\(--text\)/u);
  });
});
