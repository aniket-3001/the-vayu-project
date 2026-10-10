import { describe, expect, it } from 'vitest';
import { clientAddress } from './clientAddress';

describe('the caller’s address behind CloudFront', () => {
  it('is the viewer’s own address from CloudFront, without the port', () => {
    expect(clientAddress({ 'cloudfront-viewer-address': '203.0.113.9:4430' }, '130.176.0.1')).toBe(
      '203.0.113.9',
    );
    expect(
      clientAddress({ 'cloudfront-viewer-address': '[2001:db8::1]:4430' }, '130.176.0.1'),
    ).toBe('2001:db8::1');
  });
  it('is the connection’s address when there is no such header', () => {
    expect(clientAddress({}, '198.51.100.7')).toBe('198.51.100.7');
    expect(clientAddress({ 'cloudfront-viewer-address': '' }, '198.51.100.7')).toBe('198.51.100.7');
  });
});
