import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readLocalOptions } from '../lib/localOptions';

const file = (text: string): string => {
  const path = join(mkdtempSync(join(tmpdir(), 'vayu-opts-')), 'deploy.local.json');
  writeFileSync(path, text);
  return path;
};

describe('local deploy options', () => {
  it('is empty when there is no file', () => {
    expect(readLocalOptions(join(tmpdir(), 'vayu-no-such-file.json'))).toEqual({});
  });

  it('reads text values and ignores everything else', () => {
    expect(readLocalOptions(file('{"originSecret":"on","count":3,"x":null}'))).toEqual({ originSecret: 'on' });
  });

  it('refuses a file that is not an object', () => {
    expect(() => readLocalOptions(file('[1,2]'))).toThrow(/JSON object/u);
    expect(() => readLocalOptions(file('{oops'))).toThrow();
  });
});
