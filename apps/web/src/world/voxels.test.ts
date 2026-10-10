import { describe, expect, it } from 'vitest';
import { ROOM, buildRoom, type Box } from './voxels';

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.sx - 1e-9 &&
  a.x + a.sx > b.x + 1e-9 &&
  a.y < b.y + b.sy - 1e-9 &&
  a.y + a.sy > b.y + 1e-9 &&
  a.z < b.z + b.sz - 1e-9 &&
  a.z + a.sz > b.z + 1e-9;

const kinds = (boxes: readonly Box[], kind: Box['kind']): Box[] =>
  boxes.filter((b) => b.kind === kind);

describe('buildRoom', () => {
  const closed = buildRoom({ windows: 'closed', purifier: 'none', units: 1 });

  it('is a classroom the size the model uses: 10 by 7, four blocks high', () => {
    expect(ROOM).toMatchObject({ width: 10, depth: 7, height: 4 });
    expect(kinds(closed, 'floor')).toHaveLength(ROOM.width * ROOM.depth);
  });

  it('has three windows; shut they are glass, open they are gaps in the wall', () => {
    const open = buildRoom({ windows: 'open', purifier: 'none', units: 1 });
    expect(kinds(closed, 'glass')).toHaveLength(6);
    expect(kinds(open, 'glass')).toHaveLength(0);
    // Same wall otherwise: only the glass differs.
    expect(open).toHaveLength(closed.length - 6);
  });

  it('seats nine students at nine desks, each on a chair', () => {
    expect(kinds(closed, 'desk')).toHaveLength(9);
    expect(kinds(closed, 'chair')).toHaveLength(9);
    expect(kinds(closed, 'student-body')).toHaveLength(9);
    expect(kinds(closed, 'student-head')).toHaveLength(9);
  });

  it('puts no purifier in a room that has none, one block-stack for each unit that it has', () => {
    expect(kinds(closed, 'purifier')).toHaveLength(0);
    const one = buildRoom({ windows: 'closed', purifier: 'ours', units: 1 });
    const two = buildRoom({ windows: 'closed', purifier: 'ours', units: 2 });
    expect(kinds(two, 'purifier').length).toBe(kinds(one, 'purifier').length * 2);
    expect(kinds(one, 'purifier').length).toBeGreaterThan(0);
  });

  it('draws ours as layers and an ordinary one as a plain box, so they can be told apart', () => {
    const ours = kinds(buildRoom({ windows: 'closed', purifier: 'ours', units: 1 }), 'purifier');
    const ordinary = kinds(
      buildRoom({ windows: 'closed', purifier: 'ordinary', units: 1 }),
      'purifier',
    );
    expect(ours.length).toBeGreaterThan(ordinary.length);
    expect(new Set(ours.map((b) => b.color)).size).toBeGreaterThan(
      new Set(ordinary.map((b) => b.color)).size,
    );
  });

  it('keeps everything inside or on the walls, and nothing sinks through the floor', () => {
    for (const box of buildRoom({ windows: 'closed', purifier: 'ours', units: 3 })) {
      // The floor slab sits below zero and its top is the floor; everything else stands on it.
      if (box.kind === 'floor') expect(box.y + box.sy).toBeCloseTo(0, 9);
      else expect(box.y).toBeGreaterThanOrEqual(-1e-9);
      expect(box.x).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(box.x + box.sx).toBeLessThanOrEqual(ROOM.width + 1e-9);
      expect(box.z).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(box.z + box.sz).toBeLessThanOrEqual(ROOM.depth + 1e-9);
    }
  });

  it('puts nothing inside anything else: no desk in a student, no purifier in a desk, no wall in a window', () => {
    const solid = buildRoom({ windows: 'closed', purifier: 'ours', units: 3 }).filter(
      (b) => b.kind !== 'floor',
    );
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i];
        const b = solid[j];
        if (a !== undefined && b !== undefined)
          expect(overlaps(a, b), `${a.kind} ${i} / ${b.kind} ${j}`).toBe(false);
      }
    }
  });

  it('is repeatable', () => {
    const setup = { windows: 'open', purifier: 'ordinary', units: 2 } as const;
    expect(buildRoom(setup)).toEqual(buildRoom(setup));
  });
});
