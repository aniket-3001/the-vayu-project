import { useEffect, useRef, useState } from 'react';
import type { WorldView } from './renderer';

/** What the screen needs from whatever draws the blocks. The real one is three.js; tests pass a stub. */
export interface WorldPainter {
  resize(width: number, height: number): void;
  draw(view: WorldView, seconds: number): void;
  dispose(): void;
}

/** Loads the drawing code on demand, so the three.js library is not part of the app's first download. */
export type RendererLoader = () => Promise<(canvas: HTMLCanvasElement) => WorldPainter>;

export const defaultRendererLoader: RendererLoader = async () => {
  const { WorldRenderer } = await import('./renderer');
  return (canvas) => new WorldRenderer(canvas);
};

/**
 * The canvas the blocks are drawn on. It draws whatever `view` currently is, every frame, and tidies
 * up when it goes. If the browser cannot draw it, it says so and the rest of the screen still works.
 */
export function WorldCanvas({
  view,
  load = defaultRendererLoader,
  label,
}: {
  readonly view: WorldView;
  readonly load?: RendererLoader;
  readonly label: string;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let stopped = false;
    let painter: WorldPainter | undefined;
    let frame = 0;
    let observer: ResizeObserver | undefined;
    const started = performance.now();

    load().then(
      (create) => {
        if (stopped) return;
        try {
          painter = create(canvas);
        } catch {
          setFailed(true);
          return;
        }
        const fit = (): void => {
          painter?.resize(canvas.clientWidth, canvas.clientHeight);
        };
        fit();
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(fit);
          observer.observe(canvas);
        }
        const loop = (now: number): void => {
          painter?.draw(viewRef.current, (now - started) / 1000);
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
      },
      () => {
        if (!stopped) setFailed(true);
      },
    );

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      painter?.dispose();
    };
  }, [load]);

  return (
    <div className="world__stage">
      <canvas ref={canvasRef} className="world__canvas" role="img" aria-label={label} />
      {failed && (
        <p className="world__fallback" role="status" aria-label="3D view unavailable">
          This browser could not draw the blocks. The numbers and the chart below still work.
        </p>
      )}
    </div>
  );
}
