import { useRef } from 'react';
import { levelForAqi } from '../design/levels';

export interface TimelineSlot {
  /** The AQI for this slot, or undefined where there is none (the slot is grey). */
  readonly aqi: number | undefined;
}

/**
 * A labelled timeline coloured by AQI, with a one-slot window you slide along it, like a DJ's cue control: a
 * clear rectangle with a bold edge sits over the slot you picked, that slot is drawn larger inside it, and the AQI
 * for it is said above. Drag anywhere on the line, or use the arrow keys; screen readers get an ordinary slider.
 */
export function TimelineWindow({
  slots,
  value,
  onChange,
  label,
  valueText,
  ticks,
  nowIndex,
  bubble,
  inputId,
  max,
  rowLabel,
}: {
  readonly slots: readonly TimelineSlot[];
  readonly value: number;
  readonly onChange: (index: number) => void;
  /** The slider's name, for screen readers. */
  readonly label: string;
  readonly valueText?: string;
  /** The labels under the line, each at a slot. */
  readonly ticks: readonly { readonly index: number; readonly label: string }[];
  /** A slot to mark as now. */
  readonly nowIndex?: number | undefined;
  /** What the window says for the picked slot, above it, such as "5 to 6 pm". */
  readonly bubble: string;
  readonly inputId?: string;
  /** The last slot that can be picked; the line may run on past it. */
  readonly max?: number;
  /** A name for the bar itself, shown at its left: "Your total day". */
  readonly rowLabel?: string;
}): React.JSX.Element {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const n = Math.max(1, slots.length);
  const last = Math.min(max ?? n - 1, n - 1);
  const pick = (clientX: number): void => {
    const box = track.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0) return;
    const index = Math.floor(((clientX - box.left) / box.width) * n);
    onChange(Math.min(last, Math.max(0, index)));
  };
  const at = slots[value]?.aqi;
  const percent = ((value + 0.5) / n) * 100;
  const edge = percent < 20 ? ' at-start' : percent > 80 ? ' at-end' : '';
  return (
    <div className="timeline" style={{ '--slots': String(n) } as React.CSSProperties}>
      <div
        ref={track}
        className="tl-track"
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          pick(event.clientX);
        }}
        onPointerMove={(event) => {
          if (dragging.current) pick(event.clientX);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        {rowLabel !== undefined && <span className="tl-row-label">{rowLabel}</span>}
        <div className="tl-bar" aria-hidden="true">
          {slots.map((slot, i) => (
            <span
              // The slots are a fixed row; their place is their identity.
              key={i}
              className={`tl-cell${slot.aqi === undefined ? ' blank' : ''}${i === value ? ' picked' : ''}`}
              style={
                slot.aqi === undefined ? undefined : { background: levelForAqi(slot.aqi).solid }
              }
            />
          ))}
        </div>
        {nowIndex !== undefined && (
          <span
            className="tl-now"
            aria-hidden="true"
            style={{ left: `${String(((nowIndex + 0.5) / n) * 100)}%` }}
          />
        )}
        <div
          className={`tl-window${edge}`}
          aria-hidden="true"
          style={{ left: `${String(percent)}%`, width: `calc(${String((1 / n) * 100)}% + 18px)` }}
        >
          <span className="tl-bubble">
            <output htmlFor={inputId}>{bubble}</output>
            {at !== undefined && <b className="tnum">AQI {at}</b>}
          </span>
        </div>
        <input
          id={inputId}
          className="tl-input"
          type="range"
          min={0}
          max={last}
          value={Math.min(value, last)}
          aria-label={label}
          {...(valueText === undefined ? {} : { 'aria-valuetext': valueText })}
          onChange={(event) => {
            onChange(Number(event.target.value));
          }}
        />
      </div>
      <div className="tl-ticks" aria-hidden="true">
        {ticks.map((t) => (
          <span
            key={`${String(t.index)}-${t.label}`}
            style={{ left: `${String(((t.index + 0.5) / n) * 100)}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
