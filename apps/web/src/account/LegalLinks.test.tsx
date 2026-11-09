// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LegalLinks } from './LegalLinks';

afterEach(cleanup);

describe('LegalLinks', () => {
  it('links the privacy policy and the terms', () => {
    render(<LegalLinks />);
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveProperty(
      'pathname',
      '/privacy.html',
    );
    expect(screen.getByRole('link', { name: 'Terms of use' })).toHaveProperty(
      'pathname',
      '/terms.html',
    );
  });
});
