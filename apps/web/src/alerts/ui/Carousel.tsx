import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

/**
 * A row of small cards you swipe sideways. Pressing the heading opens it into a list that runs down the
 * page, and pressing again folds it back.
 */
export function Carousel({
  title,
  hint,
  aside,
  className = '',
  children,
}: {
  readonly title: string;
  readonly hint?: string;
  /** Something small on the right of the heading, such as a progress ring. */
  readonly aside?: React.ReactNode;
  readonly className?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const headingId = useId();
  return (
    <section className={`carousel-section ${className}`.trim()} aria-labelledby={headingId}>
      <div className="carousel-head">
        <button
          type="button"
          className="carousel-toggle"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            setOpen((v) => !v);
          }}
        >
          <span>
            <h2 id={headingId}>{title}</h2>
            {hint !== undefined && <span className="muted small">{hint}</span>}
          </span>
          <span className="carousel-more">
            {open ? 'Fold' : 'See all'}
            <ChevronDown
              size={18}
              strokeWidth={2}
              aria-hidden="true"
              className={open ? 'flip' : ''}
            />
          </span>
        </button>
        {aside}
      </div>
      <ul id={listId} className={open ? 'carousel expanded' : 'carousel'}>
        {children}
      </ul>
    </section>
  );
}
