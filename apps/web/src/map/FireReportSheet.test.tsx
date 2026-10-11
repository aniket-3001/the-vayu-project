// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FireReportSheet, coordinatesText, mapsLink } from './FireReportSheet';

afterEach(cleanup);

const fire = { lat: 30.9012, lng: 75.8573, hoursAgo: 3, frp: 12.4 };

describe('the fire report', () => {
  it('writes coordinates the way they are read out, and a map link', () => {
    expect(coordinatesText(30.9012, 75.8573)).toBe('30.9012° N, 75.8573° E');
    expect(coordinatesText(-12.5, -70.25)).toBe('12.5000° S, 70.2500° W');
    expect(mapsLink(30.9012, 75.8573)).toBe('https://www.google.com/maps?q=30.90120,75.85730');
  });

  it('shows the place, its coordinates and what the satellite saw, and the numbers to call', async () => {
    render(
      <FireReportSheet
        fire={fire}
        onClose={() => undefined}
        lookup={() => Promise.resolve('Near Ludhiana, Punjab')}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Near Ludhiana, Punjab')).toBeInTheDocument();
    });
    expect(screen.getByText('30.9012° N, 75.8573° E')).toBeInTheDocument();
    expect(screen.getByText(/about 3 h ago, burning at about 12 MW/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Call 112/u })).toHaveAttribute('href', 'tel:112');
    expect(screen.getByRole('link', { name: /Call 101/u })).toHaveAttribute('href', 'tel:101');
    expect(screen.getByRole('link', { name: 'Open in maps' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps?q=30.90120,75.85730',
    );
    expect(screen.getByText(/does not contact anyone for you/u)).toBeInTheDocument();
  });

  it('still gives the coordinates when no address is found, and copies the whole location', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(
      <FireReportSheet
        fire={fire}
        onClose={() => undefined}
        lookup={() => Promise.resolve(undefined)}
      />,
    );
    expect(screen.getByText('30.9012° N, 75.8573° E')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Copy location/u }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        '30.9012° N, 75.8573° E. https://www.google.com/maps?q=30.90120,75.85730',
      );
    });
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('closes from the cross', () => {
    const onClose = vi.fn();
    render(
      <FireReportSheet fire={fire} onClose={onClose} lookup={() => Promise.resolve(undefined)} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
