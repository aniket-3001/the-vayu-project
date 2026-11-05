import { describe, expect, it } from 'vitest';
// @ts-expect-error - a plain script with no types
import { inline, toHtml, page } from '../../scripts/build-legal.mjs';

describe('the legal pages builder', () => {
  it('escapes HTML so the Markdown cannot add script', () => {
    expect(toHtml('hello <script>alert(1)</script>')).not.toContain('<script>');
    expect(inline('**a** `b` [c](https://example.com)')).toBe(
      '<strong>a</strong> <code>b</code> <a href="https://example.com">c</a>',
    );
  });

  it('refuses links that are not https, mailto or on the site', () => {
    expect(inline('[x](javascript:alert(1))')).not.toContain('href');
  });

  it('turns a table into a table and leaves out the owner note under the title', () => {
    const html = toHtml('# T\n\n> owner note\n\n| a | b |\n| - | - |\n| 1 | 2 |\n');
    expect(html).toContain('<h1>T</h1>');
    expect(html).not.toContain('owner note');
    expect(html).toContain('<th scope="col">a</th>');
    expect(html).toContain('<td>2</td>');
  });

  it('makes a page with no script', () => {
    expect(page('Terms', '<p>x</p>')).not.toMatch(/<script/u);
  });
});
