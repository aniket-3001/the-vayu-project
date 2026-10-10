import { levelForAqi } from '../design/levels';
import { SAMPLE_IDS, SAMPLE_LABELS, sampleDay, type SampleId } from '../today/sample';
import { Pill } from '../today/ui/Chip';
import { levelVars } from '../today/ui/format';

/** Flips between the made-up days. Only exists while the data is a sample. */
export function SampleSwitcher({
  value,
  onChange,
}: {
  readonly value: SampleId;
  readonly onChange: (id: SampleId) => void;
}): React.JSX.Element {
  return (
    <nav className="switcher" aria-label="Sample days">
      <Pill>Sample data</Pill>
      <span className="muted small">
        Made-up days, shaped like Delhi&rsquo;s seasons. Pick one.
      </span>
      <div className="switcher-row">
        {SAMPLE_IDS.map((id) => {
          const aqi = sampleDay(id).aqi;
          return (
            <button
              key={id}
              type="button"
              className="day-chip"
              aria-pressed={value === id}
              style={levelVars(levelForAqi(aqi))}
              onClick={() => {
                onChange(id);
              }}
            >
              <span className="dot" aria-hidden="true" />
              {SAMPLE_LABELS[id]}
              <span className="tnum muted small">{aqi}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
