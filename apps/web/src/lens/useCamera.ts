import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState = 'off' | 'asking' | 'on' | 'denied' | 'unavailable';
/** Which way the camera looks: out at the air (back), or at the person holding the phone (front). */
export type Facing = 'environment' | 'user';

/** The camera, for as long as the Lens is open, the back one to begin with. It stays on this device; nothing is recorded or sent. */
export function useCamera(): {
  readonly state: CameraState;
  readonly facing: Facing;
  /** Whether there is a second camera to turn to. Known only once the first is on. */
  readonly canFlip: boolean;
  readonly video: React.RefObject<HTMLVideoElement>;
  readonly start: () => void;
  readonly stop: () => void;
  readonly flip: () => void;
} {
  const [state, setState] = useState<CameraState>('off');
  const [facing, setFacing] = useState<Facing>('environment');
  const [canFlip, setCanFlip] = useState(false);
  // Counts the streams handed over, so the <video> is given the new one each time the camera is turned.
  const [stream, setStream] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const live = useRef<MediaStream | null>(null);

  const release = useCallback(() => {
    live.current?.getTracks().forEach((track) => {
      track.stop();
    });
    live.current = null;
  }, []);

  const stop = useCallback(() => {
    release();
    setState('off');
    setCanFlip(false);
  }, [release]);

  useEffect(() => release, [release]);

  // Hand the stream to the <video> once both exist.
  useEffect(() => {
    if (state === 'on' && video.current !== null && live.current !== null) {
      video.current.srcObject = live.current;
      // Some browsers hand back nothing from play(), so wrap it before catching.
      void Promise.resolve(video.current.play()).catch(() => undefined);
    }
  }, [state, stream]);

  const open = useCallback(
    (way: Facing, keepOn: boolean) => {
      if (
        !('mediaDevices' in navigator) ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setState('unavailable');
        return;
      }
      if (!keepOn) setState('asking');
      release();
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { ideal: way } }, audio: false })
        .then(
          (granted) => {
            live.current = granted;
            setFacing(way);
            setStream((n) => n + 1);
            setState('on');
            // Labels and the full list are known only once a camera has been allowed.
            const devices = navigator.mediaDevices as Partial<MediaDevices>;
            if (typeof devices.enumerateDevices !== 'function') setCanFlip(true);
            else
              void devices.enumerateDevices().then(
                (found) => {
                  setCanFlip(found.filter((d) => d.kind === 'videoinput').length > 1);
                },
                () => {
                  setCanFlip(true);
                },
              );
          },
          () => {
            setState(keepOn ? 'on' : 'denied');
          },
        );
    },
    [release],
  );

  const start = useCallback(() => {
    open('environment', false);
  }, [open]);

  const flip = useCallback(() => {
    open(facing === 'environment' ? 'user' : 'environment', true);
  }, [open, facing]);

  return { state, facing, canFlip, video, start, stop, flip };
}
