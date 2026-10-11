import {
  AirVent,
  Check,
  Flame,
  Footprints,
  House,
  School,
  UserRound,
  X,
  Star,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { AqiScale } from '../../components/AqiScale';
import { MaskIcon, WindowPane } from '../../today/ui/icons';
import { POINTS, type Task, type TaskKind } from '../model';
import { useTasks } from '../useTasks';

const ICONS: Readonly<Record<Exclude<TaskKind, 'mask'>, LucideIcon>> = {
  assembly: School,
  'school-grap': TriangleAlert,
  child: UserRound,
  walk: Footprints,
  'stay-in': House,
  windows: WindowPane,
  purifier: AirVent,
  grap: TriangleAlert,
};

function Ring({
  done,
  total,
}: {
  readonly done: number;
  readonly total: number;
}): React.JSX.Element {
  const r = 20;
  const c = 2 * Math.PI * r;
  const share = total === 0 ? 0 : done / total;
  return (
    <svg
      className="task-ring"
      viewBox="0 0 48 48"
      role="img"
      aria-label={`${String(done)} of ${String(total)} done`}
    >
      <circle cx="24" cy="24" r={r} className="ring-bg" />
      <circle
        cx="24"
        cy="24"
        r={r}
        className="ring-fg"
        strokeDasharray={`${String(c * share)} ${String(c)}`}
        transform="rotate(-90 24 24)"
      />
      <text x="24" y="29" textAnchor="middle" className="ring-text">
        {done}/{total}
      </text>
    </svg>
  );
}

/** Points and the streak, in a line. Shown on My Air and in Exposure. */
export function Progress({
  progress: given,
}: {
  /** Pass the card's own progress so the two stay in step. Without it, the line reads it itself. */
  readonly progress?: ReturnType<typeof useTasks>;
}): React.JSX.Element {
  const own = useTasks();
  const progress = given ?? own;
  const { rank, next } = progress.rank;
  const toNext = next === undefined ? undefined : next.from - progress.points;
  return (
    <p className="tasks-foot">
      <span className="stat">
        <Flame size={16} strokeWidth={2} className="ic-flame" aria-hidden="true" />
        {progress.streak === 0 ? 'No streak yet' : `${String(progress.streak)}-day streak`}
      </span>
      <span className="stat">
        <Star size={16} strokeWidth={2} className="ic-star" aria-hidden="true" />
        {progress.points} points · {rank.name}
      </span>
      {toNext !== undefined && (
        <span className="muted small">
          {toNext} to {next?.name}
        </span>
      )}
    </p>
  );
}

/** The points a tip is worth: a gold star and the number, as the totals under the tips show them. */
function Points({ points }: { readonly points: number }): React.JSX.Element {
  return (
    <span className="task-points tnum" role="img" aria-label={`${String(points)} points`}>
      <Star size={18} strokeWidth={2} className="ic-star" aria-hidden="true" />
      <span aria-hidden="true">{points}</span>
    </span>
  );
}

/**
 * One tip up close, the way an alert opens: its heading, the full words behind it, where it is for, what it is worth,
 * and a button to tick it off. The card holds only the heading so that it can be read at a glance.
 */
function TipSheet({
  task,
  done,
  onToggle,
  onClose,
}: {
  readonly task: Task;
  readonly done: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const Icon = task.kind === 'mask' ? undefined : ICONS[task.kind];
  return (
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet alert-sheet tip-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
      >
        <button type="button" className="icon-button sheet-x" aria-label="Close" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
        <div className="alert-hero">
          <span className={`alert-big-icon task-${task.kind}`}>
            {Icon === undefined ? (
              <MaskIcon size={40} />
            ) : (
              <Icon size={40} strokeWidth={1.75} aria-hidden="true" />
            )}
          </span>
          {task.place !== undefined && <span className="pill">{task.place}</span>}
          <h2>{task.title}</h2>
        </div>
        <section aria-label="Details">
          <p>{task.why}</p>
        </section>
        <p className="tip-worth">
          <Star size={18} strokeWidth={2} className="ic-star" aria-hidden="true" />
          <strong>{task.points} points</strong> for doing it
        </p>
        <button type="button" className="primary" onClick={onToggle}>
          {done ? 'Mark as not done' : 'Mark as done'}
        </button>
        <button type="button" className="plain" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

/**
 * Breathe better today: what to watch for (the alerts, worst first, as a short list) and small things worth
 * doing given the air, as cards you swipe sideways, each with its reason and a gold coin of points. Tick them off
 * for points and a streak.
 */
export function TipsCard({
  tips,
  placeName,
  alerts,
}: {
  readonly tips: readonly Task[];
  readonly placeName: string;
  /** The alerts list, shown above the tips. */
  readonly alerts?: React.ReactNode;
}): React.JSX.Element {
  const progress = useTasks();
  const reduced = useReducedMotion() === true;
  const [shown, setShown] = useState<Task | undefined>(undefined);
  const doneCount = tips.filter((t) => progress.done.has(t.id)).length;
  // The scroll indicator under the row: how much of the row is in view, and where. It is drawn from the row's own
  // scroll position, so it needs no lining up with the cards, whatever their width.
  const row = useRef<HTMLUListElement>(null);
  const [view, setView] = useState({ size: 1, at: 0 });
  const measure = (): void => {
    const el = row.current;
    if (el === null || el.scrollWidth <= 0) return;
    setView({
      size: Math.min(1, el.clientWidth / el.scrollWidth),
      at: el.scrollLeft / el.scrollWidth,
    });
  };
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
    // Measured again when the tips change; the row reports its own scrolling.
  }, [tips.length]);
  const scrollToFraction = (clientX: number, track: HTMLElement): void => {
    const el = row.current;
    if (el === null) return;
    const box = track.getBoundingClientRect();
    if (box.width === 0) return;
    const centre = ((clientX - box.left) / box.width) * el.scrollWidth;
    el.scrollLeft = Math.max(
      0,
      Math.min(el.scrollWidth - el.clientWidth, centre - el.clientWidth / 2),
    );
  };
  const scrollable = view.size < 0.999;

  return (
    <section className="breathe tips" aria-labelledby="tips-title">
      <div className="breathe-head">
        <div>
          <h2 id="tips-title">Breathe better today</h2>
          <span className="muted small">Tips for {placeName}, given the air</span>
        </div>
        {tips.length > 0 && <Ring done={doneCount} total={tips.length} />}
      </div>
      {alerts}
      {tips.length > 0 && (
        <ul ref={row} className="tips-row" aria-label="Tips, swipe for more" onScroll={measure}>
          {tips.map((task) => {
            const checked = progress.done.has(task.id);
            const Icon = task.kind === 'mask' ? undefined : ICONS[task.kind];
            return (
              <li key={task.id} className={checked ? 'tip tip-card done' : 'tip tip-card'}>
                <motion.button
                  type="button"
                  className="task-check"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={`${task.title}. ${String(POINTS[task.kind])} points`}
                  onClick={() => {
                    progress.toggle(task.id);
                  }}
                  {...(reduced || !checked
                    ? {}
                    : { animate: { scale: [1, 1.18, 1] }, transition: { duration: 0.28 } })}
                >
                  {checked && <Check size={18} strokeWidth={3} aria-hidden="true" />}
                </motion.button>
                {/* The rest of the card is one button: the heading, and the full words behind it. */}
                <button
                  type="button"
                  className="tip-open"
                  aria-haspopup="dialog"
                  onClick={() => {
                    setShown(task);
                  }}
                >
                  <span className={`task-icon task-${task.kind}`}>
                    {Icon === undefined ? (
                      <MaskIcon size={20} />
                    ) : (
                      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </span>
                  <span className="task-words">
                    {task.place !== undefined && (
                      <span className="tip-place small">{task.place}</span>
                    )}
                    <strong>{task.title}</strong>
                  </span>
                  <Points points={task.points} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {tips.length > 0 && scrollable && (
        <div
          className="scroll-indicator"
          role="presentation"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            scrollToFraction(event.clientX, event.currentTarget);
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1) scrollToFraction(event.clientX, event.currentTarget);
          }}
        >
          <span
            className="scroll-thumb"
            style={{ width: `${String(view.size * 100)}%`, left: `${String(view.at * 100)}%` }}
          />
        </div>
      )}
      {shown !== undefined && (
        <TipSheet
          task={shown}
          done={progress.done.has(shown.id)}
          onToggle={() => {
            progress.toggle(shown.id);
          }}
          onClose={() => {
            setShown(undefined);
          }}
        />
      )}
      <div className="tips-footer">
        <Progress progress={progress} />
      </div>
      <AqiScale className="tips-scale" />
    </section>
  );
}
