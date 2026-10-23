import { MapPin, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { searchPlaces, type PlaceMatch } from '../../data/geocode';

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'found'; readonly matches: readonly PlaceMatch[] }
  | { readonly kind: 'none' }
  | { readonly kind: 'failed' };

/** How long the person stops typing before the search starts, so each letter does not send a request. */
const TYPING_PAUSE_MS = 300;
/** The fewest letters worth looking for. */
const MIN_LETTERS = 2;

/**
 * Looks a place up by name, a school or an office as well as a town, and pins it. Only the name typed is sent. Results
 * appear as the person types, and tapping one picks it.
 */
export function PlaceSearch({
  onPick,
  search = searchPlaces,
  trailing,
}: {
  readonly onPick: (place: PlaceMatch) => void;
  readonly search?: (query: string) => Promise<readonly PlaceMatch[]>;
  /** Something small beside the Search button, on the same row. */
  readonly trailing?: React.ReactNode;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const pause = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Counts the searches started, so an answer that arrives after a newer one began is ignored. */
  const latest = useRef(0);

  useEffect(
    () => () => {
      if (pause.current !== undefined) clearTimeout(pause.current);
      latest.current += 1;
    },
    [],
  );

  const look = (text: string): void => {
    if (pause.current !== undefined) clearTimeout(pause.current);
    const mine = ++latest.current;
    if (text.trim().length < MIN_LETTERS) {
      setState({ kind: 'idle' });
      return;
    }
    setState({ kind: 'loading' });
    search(text).then(
      (matches) => {
        if (mine !== latest.current) return;
        setState(matches.length === 0 ? { kind: 'none' } : { kind: 'found', matches });
      },
      () => {
        if (mine !== latest.current) return;
        setState({ kind: 'failed' });
      },
    );
  };

  const run = (event: React.FormEvent): void => {
    event.preventDefault();
    look(query);
  };

  const typed = (text: string): void => {
    setQuery(text);
    if (pause.current !== undefined) clearTimeout(pause.current);
    if (text.trim().length < MIN_LETTERS) {
      latest.current += 1;
      setState({ kind: 'idle' });
      return;
    }
    pause.current = setTimeout(() => {
      look(text);
    }, TYPING_PAUSE_MS);
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
          enterKeyHint="search"
          onChange={(event) => {
            typed(event.target.value);
          }}
        />
        <button type="submit" className="search-go">
          Search
        </button>
        {trailing}
      </form>
      <div aria-live="polite" className="search-status">
        {state.kind === 'loading' && <p className="muted">Looking for that place…</p>}
        {state.kind === 'none' && (
          <p className="muted">
            We could not find that. Try the name with the area or city, for example “DAV School
            Sector 49 Gurgaon”. We cover north India.
          </p>
        )}
        {state.kind === 'failed' && (
          <p className="muted">Search is not working right now. Try again in a moment.</p>
        )}
        {state.kind === 'found' && (
          <ul className="matches">
            {state.matches.map((match) => (
              <li key={`${String(match.lat)},${String(match.lng)}`}>
                <button
                  type="button"
                  className="match"
                  aria-label={`Add ${match.name}`}
                  onClick={() => {
                    if (pause.current !== undefined) clearTimeout(pause.current);
                    latest.current += 1;
                    onPick(match);
                    setState({ kind: 'idle' });
                    setQuery('');
                  }}
                >
                  <MapPin size={20} strokeWidth={1.75} aria-hidden="true" className="match-pin" />
                  <span className="match-text">
                    <strong>{match.name}</strong>
                    {match.detail !== '' && <span className="muted small">{match.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
