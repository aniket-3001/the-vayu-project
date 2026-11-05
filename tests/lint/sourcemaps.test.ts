import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appVersion, releaseName } from '../../scripts/upload-sourcemaps.mjs';

describe('source map upload', () => {
  it('names the release the way the page reports it', () => {
    expect(releaseName('0.1.0', 'abc1234')).toBe('vayu@0.1.0+abc1234');
    expect(releaseName('0.1.0', '')).toBe('vayu@0.1.0');
  });

  it('reads the version from the file the app uses', () => {
    const source = readFileSync('apps/web/src/analytics/device.ts', 'utf8');
    expect(appVersion(source)).toMatch(/^\d+\.\d+\.\d+/u);
    expect(() => appVersion('nothing here')).toThrow(/APP_VERSION/u);
  });

  it('matches crashReporting.ts, which builds the release the same way', () => {
    const page = readFileSync('apps/web/src/crashReporting.ts', 'utf8');
    expect(page).toContain("`vayu@${APP_VERSION}${build === undefined ? '' : `+${build.commit}`}`");
  });
});
