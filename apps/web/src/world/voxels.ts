import type { PurifierChoice, WindowState } from './worldModel';

/** One block of the world: a box with its lowest corner at (x, y, z) and a colour. Units are metres. */
export interface Box {
  readonly kind:
    'floor' | 'wall' | 'glass' | 'desk' | 'chair' | 'student-body' | 'student-head' | 'purifier';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly color: number;
}

/** The classroom, in blocks (one block is one metre): 10 wide, 7 deep, 4 high. */
export const ROOM = { width: 10, depth: 7, height: 4 } as const;

const COLORS = {
  floorA: 0xd9c9a3,
  floorB: 0xc9b78d,
  wall: 0xe8e4da,
  glass: 0x9fd4f2,
  desk: 0x9c6b3c,
  chair: 0x6b4a2b,
  body: 0x3f7fd1,
  skin: 0xf2c9a0,
  fan: 0x35393f,
  filter: 0xf4f4f0,
  foam: 0xe8b84a,
  plain: 0xe9ecef,
  panel: 0x4aa3df,
} as const;

/** Windows in the back wall: where they start along it, and how wide they are. */
const WINDOWS = [
  { x: 1, width: 2 },
  { x: 4, width: 2 },
  { x: 7, width: 2 },
] as const;
const WINDOW_Y = 2;

const box = (
  kind: Box['kind'],
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color: number,
): Box => ({ kind, x, y, z, sx, sy, sz, color });

const isWindowCell = (x: number, y: number): boolean =>
  y === WINDOW_Y && WINDOWS.some((w) => x >= w.x && x < w.x + w.width);

/** Where purifier units stand, by index: along the back wall, between windows. Up to three. */
const PURIFIER_SPOTS = [
  { x: 3, z: 0 },
  { x: 6, z: 0 },
  { x: 9, z: 0 },
] as const;

function purifierBoxes(
  choice: Exclude<PurifierChoice, 'none'>,
  at: { x: number; z: number },
): Box[] {
  const { x, z } = at;
  if (choice === 'ours') {
    // Layers, as built: fan at the base, the filter above it, washable foam on top.
    return [
      box('purifier', x + 0.1, 0, z + 0.1, 0.8, 0.4, 0.8, COLORS.fan),
      box('purifier', x + 0.1, 0.4, z + 0.1, 0.8, 0.7, 0.8, COLORS.filter),
      box('purifier', x + 0.1, 1.1, z + 0.1, 0.8, 0.3, 0.8, COLORS.foam),
    ];
  }
  return [
    box('purifier', x + 0.1, 0, z + 0.1, 0.8, 1.4, 0.8, COLORS.plain),
    box('purifier', x + 0.1, 1.0, z + 0.9, 0.5, 0.25, 0.02, COLORS.panel),
  ];
}

/** The classroom as blocks, for a given window state and purifier setup. Pure and repeatable. */
export function buildRoom(setup: {
  readonly windows: WindowState;
  readonly purifier: PurifierChoice;
  readonly units: number;
}): Box[] {
  const boxes: Box[] = [];

  for (let x = 0; x < ROOM.width; x++) {
    for (let z = 0; z < ROOM.depth; z++) {
      boxes.push(
        box('floor', x, -0.2, z, 1, 0.2, 1, (x + z) % 2 === 0 ? COLORS.floorA : COLORS.floorB),
      );
    }
  }

  // The back wall (z = -1), with windows. A cutaway: the front and right walls are left out.
  for (let x = -1; x < ROOM.width; x++) {
    for (let y = 0; y < ROOM.height; y++) {
      if (isWindowCell(x, y)) {
        if (setup.windows === 'closed') boxes.push(box('glass', x, y, -1, 1, 1, 0.3, COLORS.glass));
        continue;
      }
      boxes.push(box('wall', x, y, -1, 1, 1, 1, COLORS.wall));
    }
  }
  // The left wall (x = -1).
  for (let z = 0; z < ROOM.depth; z++) {
    for (let y = 0; y < ROOM.height; y++) {
      boxes.push(box('wall', -1, y, z, 1, 1, 1, COLORS.wall));
    }
  }

  // Nine desks in three rows of three, a student at each, facing the left wall.
  for (const row of [2, 3.6, 5.2] as const) {
    for (const column of [2, 4.6, 7.2] as const) {
      boxes.push(box('desk', column, 0, row, 1.4, 0.75, 0.9, COLORS.desk));
      boxes.push(box('chair', column + 0.45, 0, row - 0.7, 0.5, 0.45, 0.5, COLORS.chair));
      boxes.push(box('student-body', column + 0.5, 0.45, row - 0.65, 0.4, 0.6, 0.4, COLORS.body));
      boxes.push(box('student-head', column + 0.5, 1.05, row - 0.65, 0.4, 0.4, 0.4, COLORS.skin));
    }
  }

  if (setup.purifier !== 'none') {
    for (const spot of PURIFIER_SPOTS.slice(0, Math.max(0, Math.min(3, setup.units)))) {
      boxes.push(...purifierBoxes(setup.purifier, spot));
    }
  }
  return boxes;
}

/** Where the purifiers stand, as the point particles are drawn toward. */
export function purifierPoints(units: number): { x: number; y: number; z: number }[] {
  return PURIFIER_SPOTS.slice(0, Math.max(0, Math.min(3, units))).map((spot) => ({
    x: spot.x + 0.5,
    y: 0.9,
    z: spot.z + 0.5,
  }));
}
