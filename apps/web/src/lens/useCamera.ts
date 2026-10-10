import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState = 'off' | 'asking' | 'on' | 'denied' | 'unavailable';

/** The back camera, for as long as the Lens is open. It stays on this device; nothing is recorded or sent. */
export function useCamera(): {
  readonly state: CameraState;
  readonly video: React.RefObject<HTMLVideoElement>;
  readonly start: () => void;
  readonly stop: () => void;
} {
  const [state, setState] = useState<CameraState>('off');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((track) => {
      track.stop();
    });
    stream.current = null;
    setState('off');
  }, []);

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((track) => {
        track.stop();
      });
    },
    [],
  );

  // Hand the stream to the <video> once both exist.
  useEffect(() => {
    if (state === 'on' && video.current !== null && stream.current !== null) {
      video.current.srcObject = stream.current;
      // Some browsers hand back nothing from play(), so wrap it before catching.
      void Promise.resolve(video.current.play()).catch(() => undefined);
    }
  }, [state]);

  const start = useCallback(() => {
    if (
      !('mediaDevices' in navigator) ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setState('unavailable');
      return;
    }
    setState('asking');
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(
        (granted) => {
          stream.current = granted;
          setState('on');
        },
        () => {
          setState('denied');
        },
      );
  }, []);

  return { state, video, start, stop };
}
