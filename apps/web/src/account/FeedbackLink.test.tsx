// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FeedbackLink, feedbackHref } from './FeedbackLink';

afterEach(cleanup);

describe('the feedback link', () => {
  it('opens a mail to the given address with the build in it, and nothing else about the person', () => {
    render(
      <FeedbackLink email="help@example.org" build="Vayu 0.1.0 · build abc1234 · 2026-11-04" />,
    );
    const href = screen.getByRole('link', { name: 'Send feedback' }).getAttribute('href') ?? '';
    expect(href.startsWith('mailto:help@example.org?')).toBe(true);
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('subject')).toBe('Vayu feedback');
    expect(params.get('body')).toContain('Vayu 0.1.0 · build abc1234 · 2026-11-04');
  });

  it('is not there at all when the build has no support address', () => {
    render(<FeedbackLink email={undefined} />);
    expect(screen.queryByRole('link')).toBeNull();
    cleanup();
    render(<FeedbackLink email="" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('escapes what it puts in the address', () => {
    expect(feedbackHref('a@b.in', 'x & y=z')).toContain('x%20%26%20y%3Dz');
  });
});
