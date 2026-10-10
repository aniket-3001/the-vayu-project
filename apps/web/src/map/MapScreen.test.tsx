// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
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
    render(<MapScreen />);
    expect(screen.queryByRole('button', { name: 'Globe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument();
  });

  it('opens with the monitors, the washed-out air colour, the fires and the wind all on', () => {
    render(<MapScreen />);
    expect(seen.layers).toMatchObject({ monitors: true, gradient: true, fires: true });
    expect(seen.windOn).toBe(true);
    expect(screen.getByText('Sample data')).toBeInTheDocument();
  });

  it('has a Wind button that turns the wind off and on, and says which it is', async () => {
    render(<MapScreen />);
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
    render(<MapScreen />);
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
    render(<MapScreen />);
    expect(screen.getByRole('img', { name: /AQI colours/u })).toBeInTheDocument();
  });
});

describe('what the map says about its data', () => {
  it('names the live sources when it has them: the model and wind from Open-Meteo, the fire count from NASA', () => {
    dataNow.windLive = true;
    dataNow.airLive = true;
    dataNow.fires = 127;
    render(<MapScreen />);
    expect(
      screen.getByText(
        /127 fires in the last 24 hours \(NASA satellite\)\. Positions are a sample/u,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText(/the CAMS model via Open-Meteo, right now/u)).toBeInTheDocument();
    expect(screen.getByText(/ICON and GFS models via Open-Meteo/u)).toBeInTheDocument();
    expect(screen.queryByText(/sample flow/u)).not.toBeInTheDocument();
  });

  it('says sample, and not live, when the live data could not be reached', () => {
    render(<MapScreen />);
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    expect(screen.getByText('Wind is a sample flow.')).toBeInTheDocument();
    expect(screen.getByText(/Colour between monitors is an estimate/u)).toBeInTheDocument();
  });
});

describe('Find me', () => {
  it('flies to where the person is, and says so', async () => {
    const flyTo = vi.fn();
    seen.mapObject = { flyTo };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (p: GeolocationPosition) => void) => {
          ok({ coords: { latitude: 28.6, longitude: 77.2 } } as GeolocationPosition);
        },
      },
    });
    render(<MapScreen />);
    await userEvent.click(screen.getByRole('button', { name: /Find me/u }));
    expect(screen.getByRole('status')).toHaveTextContent('You are here.');
    expect(flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [77.2, 28.6] }));
    Reflect.deleteProperty(navigator, 'geolocation');
  });

  it('says plainly when the location cannot be had', async () => {
    seen.mapObject = { flyTo: vi.fn() };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: unknown, no: () => void) => {
          no();
        },
      },
    });
    render(<MapScreen />);
    await userEvent.click(screen.getByRole('button', { name: /Find me/u }));
    expect(screen.getByRole('status')).toHaveTextContent(/could not get your location/u);
    Reflect.deleteProperty(navigator, 'geolocation');
  });
});
