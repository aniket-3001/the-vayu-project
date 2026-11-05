/**
 * Secure Remote Password sign-in for Amazon Cognito, so the password itself never leaves the device: only a proof that
 * the person knows it does. It follows Cognito's variant of SRP-6a (the 3072-bit group of RFC 5054, SHA-256, and the
 * "Caldera Derived Key" key derivation), and `srp.test.ts` checks every step against the official
 * amazon-cognito-identity-js library on fixed inputs.
 *
 * It needs the browser's Web Crypto (`crypto.subtle`). Where that is missing, `srpAvailable()` is false and the caller
 * falls back to the older password flow.
 */

/** RFC 5054's 3072-bit prime, as Cognito uses it. */
const N_HEX = [
  'ffffffffffffffffc90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74',
  '020bbea63b139b22514a08798e3404ddef9519b3cd3a431b302b0a6df25f1437',
  '4fe1356d6d51c245e485b576625e7ec6f44c42e9a637ed6b0bff5cb6f406b7ed',
  'ee386bfb5a899fa5ae9f24117c4b1fe649286651ece45b3dc2007cb8a163bf05',
  '98da48361c55d39a69163fa8fd24cf5f83655d23dca3ad961c62f356208552bb',
  '9ed529077096966d670c354e4abc9804f1746c08ca18217c32905e462e36ce3b',
  'e39e772c180e86039b2783a2ec07a28fb5c55df06f4c52c9de2bcbf695581718',
  '3995497cea956ae515d2261898fa051015728e5a8aaac42dad33170d04507a33',
  'a85521abdf1cba64ecfb850458dbef0a8aea71575d060c7db3970f85a6e1e4c7',
  'abf5ae8cdb0933d71e8c94e04a25619dcee3d2261ad2ee6bf12ffa06d98a0864',
  'd87602733ec86a64521f2b18177b200cbbe117577a615d6c770988c0bad946e2',
  '08e24fa074e5ab3143db5bfce0fd108e4b82d120a93ad2caffffffffffffffff',
].join('');

const N = BigInt(`0x${N_HEX}`);
const G = 2n;
const INFO_BITS = new TextEncoder().encode('Caldera Derived Key');

// Web Crypto is missing on pages that are not served securely, which the types do not show.
export const srpAvailable = (): boolean =>
  (globalThis.crypto as { subtle?: SubtleCrypto } | undefined)?.subtle !== undefined;

const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

const hexToBytes = (hex: string): Uint8Array<ArrayBuffer> => {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/iu.test(hex)) {
    throw new Error('Not an even-length hex string');
  }
  return Uint8Array.from(hex.match(/.{2}/gu) ?? [], (pair) => Number.parseInt(pair, 16));
};

/**
 * A non-negative number as the even-length hex of its two's-complement bytes: a leading '00' is added when the top bit
 * would otherwise read as a sign. Cognito hashes numbers in exactly this form.
 */
export function padHex(value: bigint): string {
  if (value < 0n) throw new RangeError('padHex takes non-negative numbers');
  let hex = value.toString(16);
  if (hex.length % 2 === 1) hex = `0${hex}`;
  else if (/^[89a-f]/iu.test(hex)) hex = `00${hex}`;
  return hex;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if ((e & 1n) === 1n) result = (result * b) % modulus;
    e >>= 1n;
    b = (b * b) % modulus;
  }
  return result;
}

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

async function sha256(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

/** SHA-256 as 64 hex characters, always, including when the hash starts with zeros. */
const sha256Hex = async (data: Uint8Array<ArrayBuffer>): Promise<string> =>
  bytesToHex(await sha256(data));

async function hmac(
  key: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, data));
}

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** The client's private number and its public value A = g^a mod N. */
export interface SrpStart {
  readonly a: bigint;
  readonly A: bigint;
}

/** Makes a fresh private number (1024 bits, as the official library does) and the public value for it. */
export function startSrp(
  random: (bytes: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): SrpStart {
  const a = BigInt(`0x${bytesToHex(random(128))}`);
  const A = modPow(G, a, N);
  if (A % N === 0n) throw new Error('Illegal public value');
  return { a, A };
}

/** What the server sent in its challenge. */
export interface SrpChallenge {
  readonly userIdForSrp: string;
  readonly saltHex: string;
  readonly srpBHex: string;
  readonly secretBlockBase64: string;
}

/** The key both sides derive from the password and the two public values. 16 bytes. */
export async function passwordKey(
  poolName: string,
  start: SrpStart,
  challenge: SrpChallenge,
  password: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const B = BigInt(`0x${challenge.srpBHex}`);
  if (B % N === 0n) throw new Error('Illegal server value');
  const k = BigInt(`0x${await sha256Hex(hexToBytes(padHex(N) + padHex(G)))}`);
  const u = BigInt(`0x${await sha256Hex(hexToBytes(padHex(start.A) + padHex(B)))}`);
  if (u === 0n) throw new Error('Illegal scrambling value');
  const salt = BigInt(`0x${challenge.saltHex}`);
  const inner = await sha256Hex(utf8(`${poolName}${challenge.userIdForSrp}:${password}`));
  const x = BigInt(`0x${await sha256Hex(hexToBytes(padHex(salt) + inner))}`);
  const base = (((B - k * modPow(G, x, N)) % N) + N) % N;
  const S = modPow(base, start.a + u * x, N);
  // HKDF (RFC 5869) with the scrambling value as salt, one block of output.
  const prk = await hmac(hexToBytes(padHex(u)), hexToBytes(padHex(S)));
  const okm = await hmac(prk as Uint8Array<ArrayBuffer>, concat(INFO_BITS, Uint8Array.of(1)));
  return okm.slice(0, 16);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Cognito's time format, e.g. "Wed Nov 4 23:04:05 UTC 2026": the day without a leading zero, the rest with one. */
export function srpTimestamp(date: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  const day = DAYS[date.getUTCDay()] ?? '';
  const month = MONTHS[date.getUTCMonth()] ?? '';
  const time = `${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:${two(date.getUTCSeconds())}`;
  return `${day} ${month} ${String(date.getUTCDate())} ${time} UTC ${String(date.getUTCFullYear())}`;
}

/** The answer to Cognito's PASSWORD_VERIFIER challenge. */
export async function passwordClaim(
  poolName: string,
  start: SrpStart,
  challenge: SrpChallenge,
  password: string,
  now: Date = new Date(),
): Promise<{ readonly timestamp: string; readonly signature: string }> {
  const key = await passwordKey(poolName, start, challenge, password);
  const timestamp = srpTimestamp(now);
  const message = concat(
    utf8(poolName),
    utf8(challenge.userIdForSrp),
    fromBase64(challenge.secretBlockBase64),
    utf8(timestamp),
  );
  return { timestamp, signature: toBase64(await hmac(key, message)) };
}

/** Exposed for the tests only: the group prime and generator. */
export const SRP_GROUP = { N, G } as const;
export { bytesToHex, hexToBytes };
