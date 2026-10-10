// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { setLiveLocation, type LiveLocation, type LiveSnapshot } from '../places/liveLocation';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dataNow: { windLive: boolean; airLive: boolean; fires: number | undefined } = {
  windLive: false,
  airLive: false,
  fires: undefined,
};

const seen: {
  mapObject?: unknown;
  layers?: Record<string, boolean>;
  windOn?: boolean;
} = {};

vi.mock('./MapView', () => ({
  MapView: ({
    layers,
    onReady,
  }: {
    layers: Record<string, boolean>;
    onReady: (m: unknown) => void;
  }) => {
    seen.layers = layers;
    useEffect(() => {
      if (seen.mapObject !== undefined) onReady(seen.mapObject);
    }, [onReady]);
    return <div data-testid="map" />;
  },
}));
vi.mock('maplibre-gl', () => ({
  Marker: class {
    setLngLat(): this {
      return this;
    }
    addTo(): this {
      return this;
    }
    remove(): void {
      // Nothing to undo in a test.
    }
  },
}));
vi.mock('./useMapData', () => ({
  useMapData: () => ({ wind: [], air: [], ...dataNow }),
}));
vi.mock('./WindStars', () => ({
  WindStars: ({ enabled }: { enabled: boolean }) => {
    seen.windOn = enabled;
    return null;
  },
}));

const { MapScreen } = await import('./MapScreen');

afterEach(() => {
  cleanup();
  seen.mapObject = undefined;
  dataNow.windLive = false;
  dataNow.airLive = false;
  dataNow.fires = undefined;
});

describe('the Map screen', () => {
  it('is one view, with no Map and Globe to choose between', () => {
    render(
      <MemoryRouter>
        <MapScreen />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Globe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument();
  });

  it('opens with the monitors, the washed-out air colour, the fires and the wind all on', () => {
    render(
      <MemoryRouter>
        <MapScreen />
      </MemoryRouter>,
    );
    expect(seen.layers).toMatchObject({ monitors: true, gradient: true, fires: true });
    expect(seen.windOn).toBe(true);
    expect(screen.getByText('Sample data')).toBeInTheDocument();
  });

  it('has a Wind button that turns the wind off and on, and says which it is', async () => {
    render(
      <MemoryRouter>
        <MapScreen />
      </MemoryRouter>,
    );
    const wind = screen.getByRole('button', { name: /Wind on/u });
    expect(wind).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(wind);
    expect(seen.windOn).toBe(false);
    expect(screen.getByRole('button', { name: /Wind off/u })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByText(/Wind: ICON/u)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Wind off/u }));
    expect(seen.windOn).toBe(true);
  });

  it('keeps the other layers in a sheet, each described, and leaves the wind to its own button', async () => {
    render(
      <MemoryRouter>
        <MapScreen />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Layers' }));
    for (const name of ['Monitors', 'Air colour', 'Fires']) {
      expect(screen.getByRole('checkbox', { name: new RegExp(name, 'u') })).toBeInTheDocument();
    }
    expect(screen.queryByRole('checkbox', { name: /Wind/u })).not.toBeInTheDocument();
    expect(
      screen.getByText(/An estimate between monitors, not a measurement/u),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Fires/u }));
    expect(seen.layers?.fires).toBe(false);
    await userEvent.click(screen.getByRole('checkbox', { name: /Air colour/u }));
    expect(seen.layers?.gradient).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Layers' }));
    expect(screen.queryByRole('checkbox', { name: /Fires/u })).not.toBeInTheDocument();
  });

  it('draws a legend from Good to Hazardous', () => {
    render(
      <MemoryRouter>
        <MapScreen />
      </MemoryRouter>,
    );
    const scale = screen.getByRole('img', { name: /What the colours mean/u });
    expect(scale).toHaveAccessibleName(/Good from 0 to 50/u);
    expect(scale).toHaveAccessibleName(/Hazardous from 301 up/u);
  });
});

describe('what the map says about its data', () => {
  it('names the live sources when it has them: wind from Open-Meteo, the fire count from NASA', () => {
    dataNow.windLive = true;
    dataNow.fires = 127;
    render(
      <MemoryRouter>
        <MapScreen />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(
        /127 fires in the last 24 hours \(NASA satellite\)\. Positions are a sample/u,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText(/Colour between monitors is an estimate/u)).toBeInTheDocument();
    expect(screen.getByText(/ICON and GFS models via Open-Meteo/u)).toBeInTheDocument();
    expect(screen.queryByText(/sample flow/u)).not.toBeInTheDocument();
  });

  it('says sample, and not live, when the live data could not be reached', () => {
    render(
      <MemoryRouter>
        <MapScreen />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    expect(screen.getByText('Wind is a sample flow.')).toBeInTheDocument();
    expect(screen.getByText(/Colour between monitors is an estimate/u)).toBeInTheDocument();
  });
});

describe('live location on the map', () => {
  const fake = (snapshot: LiveSnapshot): LiveLocation => ({
    get: () => snapshot,
    subscribe: () => () => undefined,
    set: () => undefined,
    resume: () => undefined,
  });
  afterEach(() => {
    setLiveLocation(undefined);
  });

  it('has no Find me button of its own: the round live-location button does the job', () => {
    render(
      <MemoryRouter>
        <MapScreen />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /Find me/u })).not.toBeInTheDocument();
  });

  it('flies to where the device is, once, when live location is on', () => {
    const flyTo = vi.fn();
    seen.mapObject = { flyTo };
    setLiveLocation(
      fake({ enabled: true, status: 'on', position: { lat: 28.6, lng: 77.2 }, checkedAt: 1 }),
    );
    render(
      <MemoryRouter>
        <MapScreen />
      </MemoryRouter>,
    );
    expect(flyTo).toHaveBeenCalledTimes(1);
    expect(flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [77.2, 28.6] }));
  });

  it('stays where a link put it, rather than flying away from it', () => {
    const flyTo = vi.fn();
    seen.mapObject = { flyTo };
    setLiveLocation(
      fake({ enabled: true, status: 'on', position: { lat: 28.6, lng: 77.2 }, checkedAt: 1 }),
    );
    render(
      <MemoryRouter initialEntries={['/map?lat=30.5&lng=75&z=6']}>
        <MapScreen />
      </MemoryRouter>,
    );
    expect(flyTo).not.toHaveBeenCalled();
  });

  it('says so when the device is outside north India', () => {
    seen.mapObject = { flyTo: vi.fn() };
    setLiveLocation(
      fake({ enabled: true, status: 'on', position: { lat: 51.5, lng: -0.1 }, checkedAt: 1 }),
    );
    render(
      <MemoryRouter>
        <MapScreen />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/outside north India/u);
  });
});
