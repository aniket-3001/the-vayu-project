import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
  type Material,
} from 'three';
import { usStyleFor } from '../design/bands';
import { WorldEffects } from './effects';
import { MAX_PARTICLES, particleCountFor, type RoomSetup } from './worldModel';
import { INSIDE, OUTSIDE, particlePosition, pullToward } from './particles';
import { ROOM, buildRoom, purifierPoints, type Box } from './voxels';

/** What one room looks like at this moment. */
export interface RoomView {
  readonly setup: RoomSetup;
  readonly insidePm25: number;
  readonly outsidePm25: number;
  /** 0 to 1: how hard the purifier pulls the specks, from its airflow against the room's size. */
  readonly pull: number;
}

export interface WorldView {
  readonly a: RoomView;
  readonly b: RoomView;
  /** 0 to 24: the hour of the day, for the light. */
  readonly hour: number;
  /** How many times smoke has been added; each increase puffs smoke in both rooms. */
  readonly puffs: number;
}

/** Room A on the left, room B on the right, a gap between. */
const OFFSET_A = -(ROOM.width + 4);
const OFFSET_B = 4;

const SPECK = 0.13;
const NIGHT = new Color(0x141b33);
const DAY = new Color(0xbfe0f5);

interface RoomGroup {
  readonly offset: number;
  solid: InstancedMesh | undefined;
  glass: InstancedMesh | undefined;
  inside: InstancedMesh;
  haze: InstancedMesh;
  key: string;
}

/**
 * Draws two classrooms of blocks, with specks of PM2.5 in and outside each, from numbers the room
 * model has already worked out. It decides nothing: a drawing of the model, not a second model.
 */
export class WorldRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-18, 18, 12, -12, 0.1, 200);
  private readonly rooms: [RoomGroup, RoomGroup];
  private readonly dummy = new Object3D();
  private readonly colour = new Color();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly effects: WorldEffects;
  private lastPuffs = 0;
  private lastSeconds = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera.position.set(22, 20, 22);
    this.camera.lookAt(-4.5, 0.5, 0);

    this.scene.add(new AmbientLight(0xffffff, 1.5));
    const sun = new DirectionalLight(0xffffff, 1.8);
    sun.position.set(8, 20, 10);
    this.scene.add(sun);

    const speckGeometry = new BoxGeometry(SPECK, SPECK, SPECK);
    const speckMaterial = new MeshLambertMaterial({ transparent: true, opacity: 0.9 });
    this.disposables.push(speckGeometry, speckMaterial);
    const makeSpecks = (offset: number): InstancedMesh => {
      const mesh = new InstancedMesh(speckGeometry, speckMaterial.clone(), MAX_PARTICLES * 2);
      mesh.count = 0;
      mesh.position.x = offset;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.disposables.push(mesh);
      return mesh;
    };
    this.effects = new WorldEffects(this.scene, [OFFSET_A, OFFSET_B]);
    this.rooms = [OFFSET_A, OFFSET_B].map((offset) => ({
      offset,
      solid: undefined,
      glass: undefined,
      inside: makeSpecks(offset),
      haze: makeSpecks(offset),
      key: '',
    })) as [RoomGroup, RoomGroup];
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height);
    const halfHeight = 9.2;
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  /** Rebuilds a room's blocks only when its windows or purifiers changed. */
  private build(group: RoomGroup, setup: RoomSetup): void {
    const key = `${setup.windows}/${setup.purifier}/${String(setup.units)}`;
    if (key === group.key) return;
    group.key = key;
    for (const mesh of [group.solid, group.glass]) {
      if (mesh === undefined) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    }
    const boxes = buildRoom(setup);
    group.solid = this.instances(
      boxes.filter((box) => box.kind !== 'glass'),
      group.offset,
      false,
    );
    group.glass = this.instances(
      boxes.filter((box) => box.kind === 'glass'),
      group.offset,
      true,
    );
  }

  private instances(
    boxes: readonly Box[],
    offset: number,
    glass: boolean,
  ): InstancedMesh | undefined {
    if (boxes.length === 0) return undefined;
    const material = new MeshLambertMaterial(glass ? { transparent: true, opacity: 0.35 } : {});
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, boxes.length);
    boxes.forEach((box, index) => {
      this.dummy.position.set(box.x + box.sx / 2 + offset, box.y + box.sy / 2, box.z + box.sz / 2);
      this.dummy.scale.set(box.sx, box.sy, box.sz);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(index, this.dummy.matrix);
      mesh.setColorAt(index, this.colour.setHex(box.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
    return mesh;
  }

  private specks(
    mesh: InstancedMesh,
    pm25: number,
    bounds: typeof INSIDE,
    seed: number,
    t: number,
    setup?: RoomSetup,
    pull = 0,
  ): void {
    const count = particleCountFor(pm25);
    mesh.count = count;
    const tint = usStyleFor(pm25)?.background ?? '#3fae49';
    (mesh.material as MeshLambertMaterial).color.set(tint);
    const targets =
      setup === undefined || setup.purifier === 'none' ? [] : purifierPoints(setup.units);
    for (let index = 0; index < count; index++) {
      const base = particlePosition(index, t, bounds, seed);
      // A sixth of the specks near a running purifier are drawn heading into it.
      const p = index % 3 === 0 ? pullToward(base, targets, pull * 0.5) : base;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(index, this.dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Draws one frame. `seconds` is real time, which only drives the drift of the specks. */
  draw(view: WorldView, seconds: number): void {
    const daylight = Math.max(0, Math.sin(((view.hour - 6) / 12) * Math.PI));
    this.scene.background = NIGHT.clone().lerp(DAY, daylight);

    if (view.puffs > this.lastPuffs) {
      this.effects.puff(0);
      this.effects.puff(1);
    }
    this.lastPuffs = view.puffs;

    [view.a, view.b].forEach((room, index) => {
      const group = this.rooms[index];
      if (group === undefined) return;
      this.build(group, room.setup);
      this.effects.setPurifiers(
        index,
        room.setup.purifier === 'none' ? 0 : room.setup.units,
        room.pull,
      );
      this.specks(group.inside, room.insidePm25, INSIDE, 1 + index, seconds, room.setup, room.pull);
      this.specks(group.haze, room.outsidePm25, OUTSIDE, 11 + index, seconds);
    });
    this.effects.update(seconds - this.lastSeconds);
    this.lastSeconds = seconds;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const group of this.rooms) {
      for (const mesh of [group.solid, group.glass]) {
        if (mesh === undefined) continue;
        mesh.geometry.dispose();
        (mesh.material as Material).dispose();
      }
      (group.inside.material as Material).dispose();
      (group.haze.material as Material).dispose();
    }
    this.effects.dispose();
    for (const item of this.disposables) item.dispose();
    this.renderer.dispose();
  }
}
