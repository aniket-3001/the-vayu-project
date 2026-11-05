import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * iOS closes an app the moment it asks for a permission that has no usage text, and Android silently refuses one that
 * is not in the manifest. Neither shows up in the browser, so this reads the code and the two native files and fails
 * when they disagree. (The missing microphone texts that crashed the iPhone app are what this exists to catch.)
 */

const ROOT = join(import.meta.dirname, '..', '..');
const PLIST = join(ROOT, 'apps/mobile/ios/App/App/Info.plist');
const MANIFEST = join(ROOT, 'apps/mobile/android/app/src/main/AndroidManifest.xml');
const SOURCE_DIRS = ['apps/web/src', 'packages/unit/src'];

interface Capability {
  readonly name: string;
  /** What in the code means "this app asks for it". */
  readonly usedBy: RegExp;
  readonly ios: readonly string[];
  /** Any one of these satisfies the capability. */
  readonly android: readonly string[];
}

const CAPABILITIES: readonly Capability[] = [
  {
    name: 'camera',
    usedBy: /getUserMedia\(\s*\{[^}]*video/su,
    ios: ['NSCameraUsageDescription'],
    android: ['android.permission.CAMERA'],
  },
  {
    name: 'microphone',
    usedBy: /getUserMedia\(\s*\{[^}]*audio|@capacitor-community\/speech-recognition/su,
    ios: ['NSMicrophoneUsageDescription'],
    android: ['android.permission.RECORD_AUDIO'],
  },
  {
    name: 'speech recognition',
    usedBy: /@capacitor-community\/speech-recognition/u,
    ios: ['NSSpeechRecognitionUsageDescription'],
    android: ['android.permission.RECORD_AUDIO'],
  },
  {
    name: 'location',
    usedBy: /@capacitor\/geolocation/u,
    ios: ['NSLocationWhenInUseUsageDescription'],
    android: [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
  },
  {
    name: 'bluetooth',
    usedBy: /@capacitor-community\/bluetooth-le/u,
    ios: ['NSBluetoothAlwaysUsageDescription'],
    android: ['android.permission.BLUETOOTH_SCAN', 'android.permission.BLUETOOTH_CONNECT'],
  },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === 'node_modules' ? [] : sourceFiles(path);
    return /\.(?:ts|tsx)$/u.test(entry) && !entry.includes('.test.') && !path.includes('testing')
      ? [path]
      : [];
  });
}

const code = SOURCE_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).map((path) => ({
  path: relative(ROOT, path),
  text: readFileSync(path, 'utf8'),
}));
const plist = readFileSync(PLIST, 'utf8');
const manifest = readFileSync(MANIFEST, 'utf8');

/** The text under a plist key, or undefined when the key is missing or its text is empty. */
function plistText(key: string): string | undefined {
  const match = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`, 'u').exec(plist);
  const text = match?.[1]?.trim();
  return text === undefined || text === '' ? undefined : text;
}

describe('native permissions match what the code asks for', () => {
  for (const capability of CAPABILITIES) {
    const users = code.filter((file) => capability.usedBy.test(file.text)).map((file) => file.path);

    describe(capability.name, () => {
      it('is used somewhere (otherwise this rule is stale)', () => {
        expect(users.length, `nothing matches ${String(capability.usedBy)}`).toBeGreaterThan(0);
      });

      for (const key of capability.ios) {
        it(`iOS has a non-empty ${key}`, () => {
          expect(
            plistText(key),
            `${key} missing from Info.plist, needed by ${users.join(', ')}`,
          ).toBeDefined();
        });
      }

      it(`Android declares ${capability.android.join(' or ')}`, () => {
        const declared = capability.android.some((permission) =>
          new RegExp(`<uses-permission[^>]*android:name="${permission}"`, 'u').test(manifest),
        );
        expect(
          declared,
          `none of ${capability.android.join(', ')} in AndroidManifest.xml, needed by ${users.join(', ')}`,
        ).toBe(true);
      });
    });
  }
});
