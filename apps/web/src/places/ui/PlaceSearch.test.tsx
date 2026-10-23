// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaceSearch } from './PlaceSearch';

const iiit = { name: 'IIIT-Delhi', detail: 'Okhla Phase 3, New Delhi', lat: 28.5463, lng: 77.2732 };

afterEach(cleanup);

describe('PlaceSearch', () => {
  it('shows results while typing, with no press of Search, and waits for a pause', async () => {
    const search = vi.fn(() => Promise.resolve([iiit]));
    render(<PlaceSearch search={search} onPick={() => undefined} />);
    await userEvent.type(screen.getByRole('searchbox'), 'IIIT Delhi');
    expect(await screen.findByRole('button', { name: 'Add IIIT-Delhi' })).toBeInTheDocument();
    // Ten letters typed quickly make one search, not ten.
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('IIIT Delhi');
  });

  it('picks a place when its row is tapped', async () => {
    const onPick = vi.fn();
    render(<PlaceSearch search={() => Promise.resolve([iiit])} onPick={onPick} />);
    await userEvent.type(screen.getByRole('searchbox'), 'IIIT');
    await userEvent.click(await screen.findByRole('button', { name: 'Add IIIT-Delhi' }));
    expect(onPick).toHaveBeenCalledWith(iiit);
  });

  it('ignores an old answer that arrives after a newer search, and clears for one letter', async () => {
    let first: (v: (typeof iiit)[]) => void = () => undefined;
    const search = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (first = resolve)))
      .mockImplementationOnce(() => Promise.resolve([]));
    render(<PlaceSearch search={search} onPick={() => undefined} />);
    const box = screen.getByRole('searchbox');
    await userEvent.type(box, 'ab');
    await screen.findByText(/Looking for that place/u);
    await userEvent.type(box, 'c');
    expect(await screen.findByText(/could not find that/u)).toBeInTheDocument();
    first([iiit]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('button', { name: 'Add IIIT-Delhi' })).not.toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, 'a');
    expect(screen.queryByText(/could not find that/u)).not.toBeInTheDocument();
  });
});
