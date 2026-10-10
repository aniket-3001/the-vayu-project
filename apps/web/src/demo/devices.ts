export type DeviceId = 'iphone' | 'android' | 'tablet' | 'laptop';

export interface Device {
  readonly id: DeviceId;
  readonly label: string;
  /** The screen the app sees, in CSS pixels, upright. */
  readonly width: number;
  readonly height: number;
  /** Space the frame draws above and below the app: status bar and home bar, or a browser's tabs and address bar. */
  readonly top: number;
  readonly bottom: number;
  /** Thickness of the bezel around the screen. */
  readonly bezel: number;
  readonly radius: number;
  readonly canRotate: boolean;
}

export const DEVICES: readonly Device[] = [
  {
    id: 'iphone',
    label: 'iPhone',
    width: 393,
    height: 852,
    top: 54,
    bottom: 34,
    bezel: 12,
    radius: 56,
    canRotate: true,
  },
  {
    id: 'android',
    label: 'Android',
    width: 412,
    height: 915,
    top: 36,
    bottom: 28,
    bezel: 10,
    radius: 36,
    canRotate: true,
  },
  {
    id: 'tablet',
    label: 'Tablet',
    width: 820,
    height: 1180,
    top: 26,
    bottom: 22,
    bezel: 16,
    radius: 28,
    canRotate: true,
  },
  {
    id: 'laptop',
    label: 'Laptop',
    width: 1440,
    height: 900,
    top: 84,
    bottom: 0,
    bezel: 18,
    radius: 18,
    canRotate: false,
  },
];

const fallbackDevice: Device = {
  id: 'iphone',
  label: 'iPhone',
  width: 393,
  height: 852,
  top: 54,
  bottom: 34,
  bezel: 12,
  radius: 56,
  canRotate: true,
};

export const DEFAULT_DEVICE: DeviceId = 'iphone';

export const deviceById = (id: string | null): Device =>
  DEVICES.find((device) => device.id === id) ?? fallbackDevice;

export interface Geometry {
  /** What the app is drawn into. */
  readonly appWidth: number;
  readonly appHeight: number;
  /** The whole device, bezel and base included. */
  readonly outerWidth: number;
  readonly outerHeight: number;
}

/** The sizes for a device, sideways or not. A laptop has a base under its screen. */
export function geometry(device: Device, landscape: boolean): Geometry {
  const turned = landscape && device.canRotate;
  const screenW = turned ? device.height : device.width;
  const screenH = turned ? device.width : device.height;
  const base = device.id === 'laptop' ? 22 : 0;
  return {
    appWidth: screenW,
    appHeight: screenH - device.top - device.bottom,
    outerWidth: screenW + device.bezel * 2 + (device.id === 'laptop' ? 120 : 0),
    outerHeight: screenH + device.bezel * 2 + base,
  };
}

/** The largest scale at which a device fits its space, never above life size. */
export function fitScale(
  outerWidth: number,
  outerHeight: number,
  spaceWidth: number,
  spaceHeight: number,
): number {
  if (spaceWidth <= 0 || spaceHeight <= 0) return 1;
  return Math.min(1, spaceWidth / outerWidth, spaceHeight / outerHeight);
}
