import { X } from 'lucide-react';
import { clearDemo, readDemo } from './state';

/** Shown while a demo scenario is on, so nobody mistakes the staged day for the real one. Exit puts the usual sample day back. */
export function DemoPill(): React.JSX.Element | null {
  const demo = readDemo();
  if (demo === undefined) return null;
  return (
    <div className="demo-pill" role="status">
      <span>Demo: {demo.name}</span>
      <button
        type="button"
        aria-label="Exit the demo"
        onClick={() => {
          clearDemo();
          window.location.reload();
        }}
      >
        <X size={14} strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}
