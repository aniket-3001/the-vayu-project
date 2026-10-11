// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadPins, setStarterPins } from '../data/pins';
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

describe('Use preset on My Air', () => {
  it('is offered to a person with no places, and fills the screen with the preset', async () => {
    open();
    expect(screen.getByRole('button', { name: /Use preset/u })).toBeInTheDocument();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /Use preset/u }));
    });
    expect(loadPins(window.localStorage).map((p) => p.name)).toEqual([
      'Home',
      'School',
      'Office',
      'Park',
    ]);
    expect(screen.queryByRole('button', { name: /Use preset/u })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Open Home' })).toBeInTheDocument();
  });

  it('is not offered to someone who already has places, so it never replaces their own', () => {
    window.localStorage.setItem(
      'vayu.pins.v1',
      JSON.stringify([{ id: '28.59,77.05', name: 'Mine', lat: 28.5921, lng: 77.046 }]),
    );
    open();
    expect(screen.queryByRole('button', { name: /Use preset/u })).not.toBeInTheDocument();
  });
});
