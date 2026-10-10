import { CanvasTexture, MeshBasicMaterial, type Scene } from 'three';
import {
  BatchedRenderer,
  ColorOverLife,
  ConeEmitter,
  ConstantColor,
  ConstantValue,
  Gradient,
  IntervalValue,
  ParticleSystem,
  RenderMode,
  SphereEmitter,
  Vector3,
  Vector4,
} from 'three.quarks';
import { purifierPoints, ROOM } from './voxels';

/** A soft round dot, drawn once, so the effects need no image files. */
function softDot(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context !== null) {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

/** A colour that starts at `alpha` and fades to nothing over the particle's life. */
const fade = (colour: Vector3, alpha: number): ColorOverLife =>
  new ColorOverLife(
    new Gradient(
      [
        [colour, 0],
        [colour, 1],
      ],
      [
        [alpha, 0],
        [0, 1],
      ],
    ),
  );

/** The most purifiers one room draws. */
const MAX_UNITS = 3;
/** Clean air coming off a running purifier, per second at full pull. */
const MAX_STREAM_RATE = 16;

/**
 * Soft effects drawn with the open-source three.quarks particle library: a stream of clean air from
 * each running purifier, and a puff of smoke when one is added. The specks that show how much PM2.5
 * is in the room are drawn separately and exactly (see `particles.ts`); these are for the eye only.
 */
export class WorldEffects {
  private readonly batch = new BatchedRenderer();
  private readonly texture = softDot();
  private readonly material = new MeshBasicMaterial({
    map: this.texture,
    transparent: true,
    depthWrite: false,
  });
  private readonly streams: ParticleSystem[][];
  private readonly smoke: ParticleSystem[];
  private readonly scene: Scene;

  constructor(scene: Scene, offsets: readonly number[]) {
    this.scene = scene;
    scene.add(this.batch);

    this.streams = offsets.map((offset) =>
      Array.from({ length: MAX_UNITS }, (_unit, index) => {
        const point = purifierPoints(MAX_UNITS)[index];
        const system = new ParticleSystem({
          duration: 1,
          looping: true,
          startLife: new IntervalValue(1.2, 2),
          startSpeed: new IntervalValue(0.5, 0.9),
          startSize: new IntervalValue(0.18, 0.32),
          startColor: new ConstantColor(new Vector4(0.62, 0.86, 1, 0.75)),
          emissionOverTime: new ConstantValue(0),
          shape: new ConeEmitter({ radius: 0.25, angle: 0.4, thickness: 1, arc: Math.PI * 2 }),
          material: this.material,
          renderMode: RenderMode.BillBoard,
          worldSpace: true,
          behaviors: [fade(new Vector3(0.62, 0.86, 1), 0.75)],
        });
        // The cone points along +Z; stand it up so the air rises off the top of the unit.
        system.emitter.rotation.x = -Math.PI / 2;
        system.emitter.position.set((point?.x ?? 0) + offset, 1.5, point?.z ?? 0);
        this.batch.addSystem(system);
        scene.add(system.emitter);
        return system;
      }),
    );

    this.smoke = offsets.map((offset) => {
      const system = new ParticleSystem({
        duration: 0.6,
        looping: false,
        autoDestroy: false,
        startLife: new IntervalValue(3, 5),
        startSpeed: new IntervalValue(0.15, 0.4),
        startSize: new IntervalValue(0.7, 1.3),
        startColor: new ConstantColor(new Vector4(0.42, 0.37, 0.34, 0.6)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          { time: 0, count: new ConstantValue(70), cycle: 1, interval: 0.01, probability: 1 },
        ],
        shape: new SphereEmitter({ radius: 1.4, thickness: 1, arc: Math.PI * 2 }),
        material: this.material,
        renderMode: RenderMode.BillBoard,
        worldSpace: true,
        behaviors: [fade(new Vector3(0.42, 0.37, 0.34), 0.6)],
      });
      system.emitter.position.set(ROOM.width / 2 + offset, 1.6, ROOM.depth / 2);
      this.batch.addSystem(system);
      scene.add(system.emitter);
      system.pause();
      return system;
    });
  }

  /** How many purifiers stand in a room and how hard they pull (0 to 1); the streams follow. */
  setPurifiers(room: number, units: number, pull: number): void {
    this.streams[room]?.forEach((system, index) => {
      const on = index < units && pull > 0;
      system.emissionOverTime = new ConstantValue(on ? MAX_STREAM_RATE * Math.min(1, pull) : 0);
    });
  }

  /** A puff of smoke in a room, from now. */
  puff(room: number): void {
    const system = this.smoke[room];
    if (system === undefined) return;
    system.restart();
    system.play();
  }

  update(deltaSeconds: number): void {
    this.batch.update(Math.min(deltaSeconds, 0.1));
  }

  dispose(): void {
    for (const system of [...this.streams.flat(), ...this.smoke]) {
      this.batch.deleteSystem(system);
      system.dispose();
    }
    for (const system of [...this.streams.flat(), ...this.smoke]) this.scene.remove(system.emitter);
    this.material.dispose();
    this.texture.dispose();
    this.scene.remove(this.batch);
  }
}
