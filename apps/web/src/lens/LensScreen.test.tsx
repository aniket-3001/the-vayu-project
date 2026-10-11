// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PINS_STORAGE_KEY } from '../data/pins';
import { setLiveLocation } from '../places/liveLocation';
import { LensScreen } from './LensScreen';
import { sceneFor } from './SampleScene';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'mediaDevices');
  Reflect.deleteProperty(window, 'DeviceOrientationEvent');
});

const open = (): void => {
  render(
    <MemoryRouter>
      <LensScreen />
    </MemoryRouter>,
  );
};

describe('the AIR Lens', () => {
  it('opens on the first place with the air, the weather and the cleanest hour, and says what is sample', () => {
    open();
    expect(screen.getByRole('img', { name: /illustration of a home/u })).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'The air here' });
    expect(card).toHaveTextContent('Unhealthy');
    expect(card).toHaveTextContent(/\d+°/u);
  });

  it('always names the cleanest daylight hour, in am and pm with its AQI in brackets, and how long to go out', () => {
    open();
    const card = screen.getByRole('region', { name: 'The air here' });
    expect(card).toHaveTextContent(
      /Cleanest \d{1,2}( [ap]m)?–\d{1,2} [ap]m( tomorrow)? \(AQI \d+\)/u,
    );
    expect(card).not.toHaveTextContent(/No clean hour/iu);
    expect(card.querySelector('.lens-best-advice')?.textContent).toMatch(
      /min|any length|anywhere|short/u,
    );
    expect(card.querySelector('.lens-bar')).toHaveTextContent('|');
    expect(card.textContent).not.toMatch(/\d\d:\d\d/u);
  });

  it('shows a scene that matches the place: a room for Home, a school, an office, a park, a street for anywhere else', () => {
    open();
    const choose = (name: string): void => {
      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: screen.getByRole('option', { name }).getAttribute('value') },
      });
    };
    const scene = (): string | null =>
      screen.getByRole('img', { name: /illustration of a .*/u }).getAttribute('data-place');
    expect(scene()).toBe('home');
    choose('School');
    expect(scene()).toBe('school');
    choose('Office');
    expect(scene()).toBe('work');
    choose('Park');
    expect(scene()).toBe('park');
    expect(sceneFor('Near you')).toBe('street');
    expect(sceneFor('Dwarka Sector 7')).toBe('street');
    expect(sceneFor('Primary School')).toBe('school');
    expect(sceneFor('My flat')).toBe('home');
  });

  it('is one card: the scale on top, the coloured air card, then the hour window with the three buttons', () => {
    open();
    expect(document.querySelector('.lens-top')).not.toBeInTheDocument();
    const hud = document.querySelector('.lens-hud');
    const unit = hud?.querySelector('.lens-unit');
    expect(hud?.children).toHaveLength(1);
    const parts = Array.from(unit?.children ?? []).map((el) => el.className.split(' ')[0]);
    expect(parts).toEqual(['lens-unit-scale', 'place-card', 'lens-unit-time']);
    expect(unit?.querySelector('.lens-unit-scale .aqi-scale')).toBeInTheDocument();
    const time = unit?.querySelector('.lens-unit-time');
    expect(time?.querySelector('.timeline')).toBeInTheDocument();
    // After the slider, in a row: Ask, cigarettes, GPS.
    const buttons = Array.from(time?.querySelectorAll('.dock-buttons button') ?? []);
    expect(buttons).toHaveLength(3);
    expect(buttons[2]).toHaveAccessibleName('GPS');
    expect(screen.getByText('Slide the window along the next 36 hours')).toBeInTheDocument();
  });

  it('keeps the camera and the place switch in the top corner of the card', () => {
    open();
    const card = screen.getByRole('region', { name: 'The air here' });
    const tools = card.querySelector('.lens-tools');
    expect(within(card).getByRole('button', { name: /Experience on camera/u })).toBeInTheDocument();
    expect(tools?.querySelector('select')).toBeInTheDocument();
    const names = Array.from(card.querySelectorAll('option')).map((o) => o.textContent);
    expect(names[0]).toBe('Live location');
    expect(names).toContain('Home');
    expect(screen.queryByRole('button', { name: 'Use camera' })).not.toBeInTheDocument();
  });

  it('is the plain card: no fold, no wind, no sight, no source line', () => {
    open();
    const card = screen.getByRole('region', { name: 'The air here' });
    expect(
      within(card).queryByRole('button', { name: /Fold|Show the details/u }),
    ).not.toBeInTheDocument();
    expect(card.querySelector('.lens-facts')).not.toBeInTheDocument();
    expect(card).not.toHaveTextContent(/Wind from|You could see|Sample data/u);
    expect(card.querySelector('.pc-aqi strong')?.textContent).toMatch(/^\d+$/u);
    expect(card.querySelector('.pc-face svg')).toBeInTheDocument();
  });

  it('has no compass and no “About this view”', () => {
    open();
    expect(document.querySelector('.lens-more')).not.toBeInTheDocument();
    expect(screen.queryByText(/About this view/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /compass/u })).not.toBeInTheDocument();
  });

  it('says what each colour means, and marks where this air is', () => {
    open();
    const scale = screen.getByRole('img', { name: /What the colours mean/u });
    expect(scale).toHaveAccessibleName(/Good from 0 to 50/u);
    expect(scale).toHaveAccessibleName(/Hazardous from 301 up/u);
    expect(scale.querySelectorAll('.aqi-scale-bar span')).toHaveLength(6);
    expect(scale.querySelector('.aqi-scale-mark')).toBeInTheDocument();
  });

  it('changes place, and the air with it', () => {
    open();
    const unhealthy = screen.getByRole('region', { name: 'The air here' }).textContent;
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: screen.getByRole('option', { name: 'Park' }).getAttribute('value') },
    });
    expect(screen.getByRole('region', { name: 'The air here' })).toHaveTextContent('Good');
    expect(screen.getByRole('region', { name: 'The air here' }).textContent).not.toBe(unhealthy);
  });

  it('has a labelled timeline with a one-hour window that moves the picture through the next day and a half', () => {
    open();
    const dial = screen.getByRole('slider', { name: 'Time, hours from now' });
    expect(dial).toHaveAttribute('max', '36');
    const bubble = (): string | null | undefined =>
      document.querySelector('.tl-bubble output')?.textContent;
    expect(bubble()).toBe('Now');
    expect(document.querySelectorAll('.tl-cell').length).toBeGreaterThanOrEqual(37);
    expect(document.querySelector('.tl-cell.picked')).toBeInTheDocument();
    const labels = Array.from(document.querySelectorAll('.tl-ticks span')).map(
      (el) => el.textContent,
    );
    expect(labels[0]).toBe('Now');
    expect(labels.some((l) => /^\d{1,2} [ap]m$/u.test(l ?? ''))).toBe(true);
    fireEvent.change(dial, { target: { value: '5' } });
    expect(screen.getByText('in 5 h')).toBeInTheDocument();
    expect(bubble()).toBe('10:30 pm');
    expect(document.querySelector('.tl-bubble b')?.textContent).toMatch(/^AQI \d+$/u);
    expect(dial.getAttribute('aria-valuetext')).toMatch(/Sat 10 Oct, 10:30 pm/u);
  });

  it('turns on the camera when asked, and turns it off again', async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    open();
    await userEvent.click(screen.getByRole('button', { name: /Experience on camera/u }));
    await userEvent.click(await screen.findByRole('button', { name: /Stop camera/u }));
    expect(stop).toHaveBeenCalled();
    expect(screen.getByRole('img', { name: /illustration of a home/u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Experience on camera/u })).toBeInTheDocument();
  });

  it('carries on with an illustration when the camera is refused or missing', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('no')) },
    });
    open();
    await userEvent.click(screen.getByRole('button', { name: /Experience on camera/u }));
    expect(
      await screen.findByText('Camera not allowed, so an illustration stands in.'),
    ).toBeInTheDocument();
    cleanup();
    Reflect.deleteProperty(navigator, 'mediaDevices');
    open();
    await userEvent.click(screen.getByRole('button', { name: /Experience on camera/u }));
    expect(screen.getByText('No camera here, so an illustration stands in.')).toBeInTheDocument();
  });

  it('asks the browser for where you are when the live outdoor location is chosen', () => {
    const set = vi.fn();
    const off = { enabled: false, status: 'off' } as const;
    setLiveLocation({
      get: () => off,
      subscribe: () => () => undefined,
      set,
      resume: () => undefined,
    });
    open();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'live' } });
    expect(set).toHaveBeenCalledWith(true);
    setLiveLocation(undefined);
  });

  it('says what to do when nothing is pinned', () => {
    window.localStorage.setItem(PINS_STORAGE_KEY, '[]');
    open();
    expect(screen.getByText(/Nothing pinned yet/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pin a place on My Air' })).toBeInTheDocument();
  });

  it('plays the next 36 hours in five seconds from a play button, and stops at the end', async () => {
    vi.useFakeTimers();
    try {
      open();
      const dial = screen.getByRole('slider', { name: 'Time, hours from now' });
      expect(dial).toHaveValue('0');
      fireEvent.click(screen.getByRole('button', { name: 'Play the next 36 hours' }));
      expect(screen.getByRole('button', { name: 'Pause the 36 hours' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      const half = Number((dial as HTMLInputElement).value);
      expect(half).toBeGreaterThan(10);
      expect(half).toBeLessThan(26);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(dial).toHaveValue('36');
      expect(screen.getByRole('button', { name: 'Play the next 36 hours' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('pauses where it is when pressed again', async () => {
    vi.useFakeTimers();
    try {
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Play the next 36 hours' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Pause the 36 hours' }));
      const dial = screen.getByRole('slider', { name: 'Time, hours from now' });
      const at = (dial as HTMLInputElement).value;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(dial).toHaveValue(at);
    } finally {
      vi.useRealTimers();
    }
  });
});
