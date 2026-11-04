// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

/**
 * Automated accessibility checks with axe-core on the screens that need no map or camera. They catch the mechanical
 * faults (a button with no name, an image with no alt text, a form field with no label, a bad heading order, a missing
 * landmark). They cannot judge colour contrast (jsdom draws nothing), reading order, or how it sounds in VoiceOver
 * and TalkBack: those still need a person with a phone (see docs/PRODUCTION-CHECKLIST.md).
 */
beforeEach(() => {
  window.localStorage.clear();
});
afterEach(cleanup);

const ROUTES = ['#/', '#/exposure', '#/account', '#/room'];

async function violationsOn(hash: string): Promise<string[]> {
  window.location.hash = hash;
  const { container } = render(<App />);
  const result = await axe.run(container, {
    // jsdom has no layout or paint, so these cannot be evaluated here.
    rules: {
      'color-contrast': { enabled: false },
      'color-contrast-enhanced': { enabled: false },
      region: { enabled: false },
    },
  });
  return result.violations.map(
    (v) =>
      `${v.id}: ${v.help} (${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')})`,
  );
}

describe('accessibility (automated)', () => {
  for (const hash of ROUTES) {
    it(`finds no axe violations on ${hash}`, async () => {
      expect(await violationsOn(hash)).toEqual([]);
    });
  }
});
