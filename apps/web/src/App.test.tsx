// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '#/';
});
afterEach(cleanup);

describe('the frame around every screen', () => {
  it('has no pinned top bar: no wordmark, no header strip', () => {
    render(<App />);
    expect(document.querySelector('.bar')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vayu Air' })).not.toBeInTheDocument();
  });

  it('puts the cigarette beside the Ask button, in one dock that stays on every screen', async () => {
    render(<App />);
    const dock = document.querySelector<HTMLElement>('.dock');
    if (dock === null) throw new Error('no dock');
    expect(within(dock).getByRole('button', { name: /Relatable measure/u })).toBeInTheDocument();
    expect(within(dock).getByRole('button', { name: 'Ask Vayu' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Exposure' }));
    expect(document.querySelector('.dock')).toBeInTheDocument();
  });

  it('lights the cigarette up in colour with a little smoke when it is on, and goes plain when it is off', async () => {
    render(<App />);
    const toggle = screen.getByRole('button', { name: /Relatable measure/u });
    expect(toggle.querySelector('.smoke-puffs')).not.toBeInTheDocument();
    expect(toggle.querySelector('rect[fill="#ff6a2b"]')).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle.querySelectorAll('.smoke-puffs i')).toHaveLength(3);
    expect(toggle.querySelector('rect[fill="#ff6a2b"]')).toBeInTheDocument();
    expect(toggle.querySelector('rect[fill="#e0953f"]')).toBeInTheDocument();
    expect(toggle.querySelector('rect[fill="#ffffff"]')).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle.querySelector('.smoke-puffs')).not.toBeInTheDocument();
  });
});
