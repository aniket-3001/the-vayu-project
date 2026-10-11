// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setStarterPins } from '../data/pins';
import { MyAirScreen } from './MyAirScreen';

beforeEach(() => {
  window.localStorage.clear();
  // The deployed app starts a new person with no places.
  setStarterPins([]);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const open = (): void => {
  render(
    <MemoryRouter>
      <MyAirScreen />
    </MemoryRouter>,
  );
};

describe('The recorded days link on My Air', () => {
  it('is offered to a person with no places, and opens the recorded days in a new tab', () => {
    open();
    const link = screen.getByRole('link', { name: /See the recorded days/u });
    expect(link).toHaveAttribute('href', '#/week');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('is not shown to someone who already has places', () => {
    window.localStorage.setItem(
      'vayu.pins.v1',
      JSON.stringify([{ id: '28.59,77.05', name: 'Mine', lat: 28.5921, lng: 77.046 }]),
    );
    open();
    expect(screen.queryByRole('link', { name: /See the recorded days/u })).not.toBeInTheDocument();
  });
});
