// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultLayers } from './layers';

const seen: { mode?: string; layers?: Record<string, boolean>; windOn?: boolean } = {};

vi.mock('./MapView', () => ({
  MapView: ({ mode, layers }: { mode: string; layers: Record<string, boolean> }) => {
    seen.mode = mode;
    seen.layers = layers;
    return <div data-testid="map" />;
  },
}));
vi.mock('./WindCanvas', () => ({
  WindCanvas: ({ enabled }: { enabled: boolean }) => {
    seen.windOn = enabled;
    return null;
  },
  angleBetween: () => 0,
}));

const { MapScreen } = await import('./MapScreen');

afterEach(cleanup);

describe('the Map screen', () => {
  it('opens on the flat map with monitors and fires, and says the data is a sample', () => {
    render(<MapScreen />);
    expect(seen.mode).toBe('map');
    expect(seen.layers).toMatchObject({ monitors: true, fires: true, gradient: false });
    expect(seen.windOn).toBe(false);
    expect(screen.getByText('Sample data')).toBeInTheDocument();
    expect(screen.getByText(/Fires, last 24 hours/u)).toBeInTheDocument();
    expect(screen.queryByText(/Colour between monitors is an estimate/u)).not.toBeInTheDocument();
  });

  it('switches to the globe, which opens on the air colour and the wind, and says both are not measurements', async () => {
    render(<MapScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Globe' }));
    expect(seen.mode).toBe('globe');
    expect(seen.layers).toMatchObject({ gradient: true, monitors: false, fires: false });
    expect(seen.windOn).toBe(true);
    expect(screen.getByText(/Colour between monitors is an estimate/u)).toBeInTheDocument();
    expect(screen.getByText(/Wind is a sample flow/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Globe' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens a layers sheet with four switches, each described, and turns them on and off', async () => {
    render(<MapScreen />);
    await userEvent.click(screen.getByRole('button', { name: /Layers/u }));
    for (const name of ['Monitors', 'Air colour', 'Wind', 'Fires']) {
      expect(screen.getByRole('checkbox', { name: new RegExp(name, 'u') })).toBeInTheDocument();
    }
    expect(
      screen.getByText(/An estimate between monitors, not a measurement/u),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Wind/u }));
    expect(seen.windOn).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: /Fires/u }));
    expect(seen.layers?.fires).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /Layers/u }));
    expect(screen.queryByRole('checkbox', { name: /Wind/u })).not.toBeInTheDocument();
  });

  it('draws a legend from Good to Hazardous', () => {
    render(<MapScreen />);
    expect(screen.getByRole('img', { name: /AQI colours/u })).toBeInTheDocument();
  });

  it('resets the layers to the view’s own when switching back to the map', async () => {
    render(<MapScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Globe' }));
    await userEvent.click(screen.getByRole('button', { name: 'Map' }));
    expect(seen.layers).toMatchObject(defaultLayers('map'));
  });
});
