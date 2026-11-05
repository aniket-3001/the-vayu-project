import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = readFileSync('apps/mobile/android/app/src/main/AndroidManifest.xml', 'utf8');

describe('the Android manifest', () => {
  it('does not let the phone back up the app, which would copy the saved sign-in out of it', () => {
    expect(manifest).toMatch(/android:allowBackup="false"/u);
  });

  it('does not allow plain http traffic', () => {
    expect(manifest).not.toMatch(/usesCleartextTraffic="true"/u);
  });

  it('exports only the launcher screen', () => {
    const exported = manifest.match(/android:exported="true"/gu) ?? [];
    expect(exported).toHaveLength(1);
  });
});

describe('the Android build settings', () => {
  it('needs Android 8 or later, since older versions no longer get security patches', () => {
    const gradle = readFileSync('apps/mobile/android/variables.gradle', 'utf8');
    const min = Number(/minSdkVersion\s*=\s*(\d+)/u.exec(gradle)?.[1]);
    expect(min).toBeGreaterThanOrEqual(26);
  });
});
