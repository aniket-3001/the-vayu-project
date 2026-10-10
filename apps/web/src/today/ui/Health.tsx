import { adviceFor } from '../advice';
import { AdviceGlyph } from './icons';

/** What to do about it, from the US EPA's general guidance. One plain line each. */
export function Health({ aqi }: { readonly aqi: number }): React.JSX.Element {
  return (
    <section className="card" aria-labelledby="health-title">
      <div className="card-head">
        <h2 id="health-title">Health recommendations</h2>
      </div>
      <ul className="advice">
        {adviceFor(aqi).map((item) => (
          <li key={item.text}>
            <span className="advice-icon">
              <AdviceGlyph name={item.icon} />
            </span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">
        General guidance from the US EPA. Not medical advice; official orders come first.
      </p>
    </section>
  );
}
