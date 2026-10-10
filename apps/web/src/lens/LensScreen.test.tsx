// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PINS_STORAGE_KEY } from '../data/pins';
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

describe('the AR Lens', () => {
  it('opens on the first place with the air, the wind, how far you can see, and says what is sample', () => {
    open();
    expect(screen.getByRole('img', { name: /illustration of a home/u })).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'The air here' });
    expect(card).toHaveTextContent('Unhealthy');
    expect(card).toHaveTextContent(/Wind from the north-west, \d+ km\/h/u);
    expect(card).toHaveTextContent(/You could see about \d/u);
    expect(card).toHaveTextContent('Estimate');
    expect(card).toHaveTextContent('Sample data');
    expect(card).toHaveTextContent('An illustration stands in for the camera.');
  });

  it('says the cleanest daylight hour, or that there is none on a bad day', () => {
    open();
    expect(
      screen.getByText('No clean hour outside today. If you can stay in, do.'),
    ).toBeInTheDocument();
    cleanup();
    open();
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: screen.getByRole('option', { name: 'Park' }).getAttribute('value') },
    });
    expect(
      screen.getByText(/Cleanest daylight hour: \d\d:\d\d( tomorrow)?, AQI \d+\./u),
    ).toBeInTheDocument();
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

  it('puts the colour scale and two round buttons at the top, and the card and the slider together below', () => {
    open();
    const top = document.querySelector('.lens-top');
    expect(Array.from(top?.children ?? []).map((el) => el.className.split(' ')[0])).toEqual([
      'aqi-scale',
      'lens-actions',
    ]);
    const hud = document.querySelector('.lens-hud');
    const kids = Array.from(hud?.children ?? []);
    expect(kids).toHaveLength(2);
    // The card is the home screen's place card, opened out; under it is the time slider.
    expect(kids[0]).toHaveClass('place-card', 'lens-card');
    expect(kids[1]).toHaveClass('lens-dial');
    const round = Array.from(top?.querySelectorAll('.lens-round') ?? []);
    expect(round).toHaveLength(2);
    expect(round[0]).toHaveAccessibleName('Use camera');
    expect(round[0]?.textContent).toBe('');
    expect(round[1]?.querySelector('select')).toBeInTheDocument();
    expect(round[1]).toHaveAccessibleName(/Place to look at/u);
  });

  it('says what each colour means, and marks where this air is', () => {
    open();
    const scale = screen.getByRole('img', { name: /What the colours mean/u });
    expect(scale).toHaveAccessibleName(/Good from 0 to 50/u);
    expect(scale).toHaveAccessibleName(/Hazardous from 301 up/u);
    expect(scale.querySelectorAll('.aqi-scale-bar span')).toHaveLength(6);
    expect(scale.querySelector('.aqi-scale-mark')).toBeInTheDocument();
  });

  it('keeps the camera and compass words behind “About this view”, so the picture stays clear', () => {
    open();
    const more = document.querySelector('.lens-more');
    expect(more).not.toHaveAttribute('open');
    expect(more).toHaveTextContent('About this view');
  });

  it('is small until opened, then shows the wind, how far you can see and the best hour', async () => {
    open();
    const card = screen.getByRole('region', { name: 'The air here' });
    expect(card).not.toHaveClass('open');
    expect(card.querySelector('.pc-more')).toHaveAttribute('hidden');
    await userEvent.click(screen.getByRole('button', { name: 'Show more about the air here' }));
    expect(card).toHaveClass('open');
    expect(card.querySelector('.pc-more')).not.toHaveAttribute('hidden');
    await userEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(card).not.toHaveClass('open');
  });

  it('shows the face, the number, the wind, how far you can see and where the reading came from', () => {
    open();
    const card = screen.getByRole('region', { name: 'The air here' });
    expect(card.querySelector('.pc-face svg')).toBeInTheDocument();
    expect(card.querySelector('.pc-aqi strong')?.textContent).toMatch(/^\d+$/u);
    expect(card).toHaveTextContent(/You could see about/u);
    expect(card.querySelector('.pc-source')).toBeInTheDocument();
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

  it('has a time dial that moves the picture through the next day and a half', () => {
    open();
    const dial = screen.getByRole('slider', { name: 'Time, hours from now' });
    expect(dial).toHaveAttribute('max', '36');
    expect(screen.getByText('Now')).toBeInTheDocument();
    fireEvent.change(dial, { target: { value: '5' } });
    expect(screen.getByText('in 5 h')).toBeInTheDocument();
    expect(screen.queryByText('Now')).not.toBeInTheDocument();
    expect(dial.getAttribute('aria-valuetext')).toMatch(/Sat 10 Oct, 22:30/u);
  });

  it('turns on the camera when asked, and turns it off again', async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Use camera' }));
    expect(await screen.findByText('Camera on; nothing leaves this phone.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /illustration of a home/u })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Camera off/u }));
    expect(stop).toHaveBeenCalled();
    expect(screen.getByRole('img', { name: /illustration of a home/u })).toBeInTheDocument();
  });

  it('carries on with an illustration when the camera is refused or missing', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('no')) },
    });
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Use camera' }));
    expect(await screen.findByText('Camera not allowed, so an illustration.')).toBeInTheDocument();
    cleanup();
    Reflect.deleteProperty(navigator, 'mediaDevices');
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Use camera' }));
    expect(screen.getByText('No camera here, so an illustration.')).toBeInTheDocument();
  });

  it('asks for the compass on a phone that needs a tap, and then follows where it points', async () => {
    const request = vi.fn().mockResolvedValue('granted');
    class FakeOrientation extends Event {
      static requestPermission = request;
    }
    Object.defineProperty(window, 'DeviceOrientationEvent', {
      configurable: true,
      value: FakeOrientation,
    });
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Show more about the air here' }));
    await userEvent.click(screen.getByRole('button', { name: /Turn on the compass/u }));
    expect(request).toHaveBeenCalled();
    const turn = new Event('deviceorientation');
    Object.assign(turn, { webkitCompassHeading: 315 });
    await act(async () => {
      window.dispatchEvent(turn);
      await Promise.resolve();
    });
    expect(screen.getByText('Facing north-west.')).toBeInTheDocument();
  });

  it('says what to do when nothing is pinned', () => {
    window.localStorage.setItem(PINS_STORAGE_KEY, '[]');
    open();
    expect(screen.getByText(/Nothing pinned yet/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pin a place on My Air' })).toBeInTheDocument();
  });
});
