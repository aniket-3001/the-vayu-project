import { describe, expect, it } from 'vitest';
import { webBluetooth } from './ble';
import { nativeBle } from './nativeBle';
import { defaultTransport, pickTransport } from './transport';

describe('choosing how to reach a unit', () => {
  it('uses the native plugin inside the app and the browser API everywhere else', () => {
    expect(pickTransport(true)).toBe(nativeBle);
    expect(pickTransport(false)).toBe(webBluetooth);
  });

  it('uses the browser API in a normal build, which sets no native flag', () => {
    expect(defaultTransport).toBe(webBluetooth);
  });
});
