import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { searchPlaces, type PlaceMatch } from '../../data/geocode';

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'found'; readonly matches: readonly PlaceMatch[] }
  | { readonly kind: 'none' }
  | { readonly kind: 'failed' };

/** Looks a place up by name and pins it. Only the name typed is sent, to Open-Meteo's geocoder. */
export function PlaceSearch({
  onPick,
  search = searchPlaces,
}: {
  readonly onPick: (place: PlaceMatch) => void;
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  const run = (event: React.FormEvent): void => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setState({ kind: 'loading' });
    search(query).then(
      (matches) => {
        setState(matches.length === 0 ? { kind: 'none' } : { kind: 'found', matches });
      },
      () => {
        setState({ kind: 'failed' });
      },
    );
  };

  return (
    <section className="search" aria-label="Find a place">
      <form onSubmit={run} role="search" className="search-form">
        <label className="sr-only" htmlFor="place-query">
          Search for a place in north India
        </label>
        <Search size={20} strokeWidth={1.75} aria-hidden="true" className="search-icon" />
        <input
          id="place-query"
          type="search"
          value={query}
          placeholder="Search for a place"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <button type="submit">Search</button>
      </form>
      <div aria-live="polite" className="search-status">
        {state.kind === 'loading' && <p className="muted">Checking the monitors nearby…</p>}
        {state.kind === 'none' && (
          <p className="muted">
            No monitors cover that place. We cover north India, so try a nearby city.
          </p>
        )}
        {state.kind === 'failed' && (
          <p className="muted">Search is not working right now. Try again in a moment.</p>
        )}
        {state.kind === 'found' && (
          <ul className="matches">
            {state.matches.map((match) => (
              <li key={`${String(match.lat)},${String(match.lng)}`}>
                <span>
                  <strong>{match.name}</strong>
                  {match.detail !== '' && <span className="muted"> · {match.detail}</span>}
                </span>
                <button
                  type="button"
                  aria-label={`Add ${match.name}`}
                  onClick={() => {
                    onPick(match);
                    setState({ kind: 'idle' });
                    setQuery('');
                  }}
                >
                  <Plus size={18} strokeWidth={2} aria-hidden="true" /> Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
