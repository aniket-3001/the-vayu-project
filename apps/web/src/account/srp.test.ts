import { createHash, createHmac } from 'node:crypto';
import AuthenticationHelper from 'amazon-cognito-identity-js/lib/AuthenticationHelper.js';
import DateHelper from 'amazon-cognito-identity-js/lib/DateHelper.js';
import { describe, expect, it, vi } from 'vitest';
import {
  SRP_GROUP,
  bytesToHex,
  padHex,
  passwordClaim,
  passwordKey,
  srpAvailable,
  srpTimestamp,
  startSrp,
} from './srp';

/**
 * The official library is the reference: on the same private number, server value, salt and password, every value
 * this module makes must equal the library's. (The library pads a hash that starts with a zero nibble one zero short;
 * these fixed seeds avoid that case, and a separate test below checks this module pads to the full 64 characters.)
 */
interface LibBigInt {
  toString(radix: number): string;
}
interface Helper {
  smallAValue: LibBigInt;
  N: { constructor: new (text: string, radix: number) => LibBigInt };
  getLargeAValue(cb: (err: Error | null, a: LibBigInt) => void): void;
  getPasswordAuthenticationKey(
    user: string,
    password: string,
    b: LibBigInt,
    salt: LibBigInt,
    cb: (err: Error | null, key: ArrayLike<number>) => void,
  ): void;
}
const Lib = AuthenticationHelper as unknown as new (pool: string) => Helper;

/** Bytes that depend only on the seed, so the test is the same on every run. */
const seeded = (seed: string, length: number): Uint8Array => {
  const out: number[] = [];
  for (let counter = 0; out.length < length; counter++) {
    out.push(
      ...createHash('sha256')
        .update(`${seed}:${String(counter)}`)
        .digest(),
    );
  }
  return Uint8Array.from(out.slice(0, length));
};

const POOL = 'AbC123xyz';
const USER = 'f3b1c9a0-1111-4222-8333-444455556666';
const PASSWORD = 'correct horse battery staple 9!';
const SEEDS = ['seed-1', 'seed-2', 'seed-3', 'seed-4', 'seed-5'];

async function viaLibrary(
  saltHex: string,
  bHex: string,
): Promise<{ aHex: string; aSmallHex: string; key: Buffer }> {
  const helper = new Lib(POOL);
  const aSmallHex = helper.smallAValue.toString(16);
  const aHex = await new Promise<string>((resolve, reject) => {
    helper.getLargeAValue((err, a) => {
      if (err !== null) reject(err);
      else resolve(a.toString(16));
    });
  });
  const Big = helper.N.constructor;
  const key = await new Promise<Buffer>((resolve, reject) => {
    helper.getPasswordAuthenticationKey(
      USER,
      PASSWORD,
      new Big(bHex, 16),
      new Big(saltHex, 16),
      (err, k) => {
        if (err !== null) reject(err);
        else resolve(Buffer.from(k));
      },
    );
  });
  return { aHex, aSmallHex, key };
}

describe('SRP against the official library', () => {
  for (const seed of SEEDS) {
    it(`derives the same public value and password key (${seed})`, async () => {
      const saltHex = bytesToHex(seeded(`${seed}:salt`, 16));
      // Any non-zero value below N is a valid server value for the client's arithmetic.
      const bHex = bytesToHex(seeded(`${seed}:B`, 384));
      const lib = await viaLibrary(saltHex, bHex);

      // Same private number as the library chose, so the two can be compared.
      const start = startSrp(() => {
        const hex = lib.aSmallHex.padStart(256, '0');
        return Uint8Array.from(hex.match(/.{2}/gu) ?? [], (p) => Number.parseInt(p, 16));
      });
      expect(start.A.toString(16)).toBe(lib.aHex);

      const key = await passwordKey(
        POOL,
        start,
        { userIdForSrp: USER, saltHex, srpBHex: bHex, secretBlockBase64: '' },
        PASSWORD,
      );
      expect(bytesToHex(key)).toBe(lib.key.toString('hex'));
    });
  }

  it('signs the claim the way Cognito checks it: HMAC of pool, user, secret block and time', async () => {
    const seed = SEEDS[0] ?? 'seed-1';
    const saltHex = bytesToHex(seeded(`${seed}:salt`, 16));
    const bHex = bytesToHex(seeded(`${seed}:B`, 384));
    const lib = await viaLibrary(saltHex, bHex);
    const start = startSrp(() =>
      Uint8Array.from(lib.aSmallHex.padStart(256, '0').match(/.{2}/gu) ?? [], (p) =>
        Number.parseInt(p, 16),
      ),
    );
    const secretBlock = Buffer.from(seeded('block', 60)).toString('base64');
    const now = new Date(Date.UTC(2026, 10, 4, 3, 4, 5));
    const claim = await passwordClaim(
      POOL,
      start,
      { userIdForSrp: USER, saltHex, srpBHex: bHex, secretBlockBase64: secretBlock },
      PASSWORD,
      now,
    );
    const expected = createHmac('sha256', lib.key)
      .update(
        Buffer.concat([
          Buffer.from(POOL),
          Buffer.from(USER),
          Buffer.from(secretBlock, 'base64'),
          Buffer.from(claim.timestamp),
        ]),
      )
      .digest('base64');
    expect(claim.signature).toBe(expected);
  });
});

describe('the pieces', () => {
  it('writes the timestamp exactly as the official library does', () => {
    vi.useFakeTimers();
    try {
      for (const when of [
        new Date(Date.UTC(2026, 10, 4, 3, 4, 5)),
        new Date(Date.UTC(2026, 0, 31, 23, 59, 59)),
        new Date(Date.UTC(2027, 8, 9, 0, 0, 0)),
      ]) {
        vi.setSystemTime(when);
        const lib = new (DateHelper as unknown as new () => { getNowString(): string })();
        expect(srpTimestamp(when)).toBe(lib.getNowString());
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('adds a sign byte only when the top bit is set, and keeps an even length', () => {
    expect(padHex(0n)).toBe('00');
    expect(padHex(0x7fn)).toBe('7f');
    expect(padHex(0x80n)).toBe('0080');
    expect(padHex(0xffn)).toBe('00ff');
    expect(padHex(0x100n)).toBe('0100');
    expect(padHex(0xfffn)).toBe('0fff');
    expect(padHex(0x8000n)).toBe('008000');
    expect(() => padHex(-1n)).toThrow();
  });

  it('uses the 3072-bit group with generator 2', () => {
    expect(SRP_GROUP.N.toString(2).length).toBe(3072);
    expect(SRP_GROUP.G).toBe(2n);
    expect(SRP_GROUP.N % 2n).toBe(1n);
  });

  it('makes a different private number each time, and refuses nothing valid', () => {
    const a = startSrp();
    const b = startSrp();
    expect(a.a).not.toBe(b.a);
    expect(a.A).toBeGreaterThan(1n);
  });

  it('refuses a server value of zero', async () => {
    const start = startSrp();
    await expect(
      passwordKey(
        POOL,
        start,
        { userIdForSrp: USER, saltHex: 'aa', srpBHex: '00', secretBlockBase64: '' },
        PASSWORD,
      ),
    ).rejects.toThrow(/server value/u);
  });

  it('knows whether the browser can do it', () => {
    expect(srpAvailable()).toBe(true);
  });
});
