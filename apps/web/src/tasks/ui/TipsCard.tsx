import {
  AirVent,
  AppWindow,
  Check,
  Flame,
  Footprints,
  House,
  Star,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';
import { MaskIcon } from '../../today/ui/icons';
import { POINTS, type Task, type TaskKind } from '../model';
import { useTasks } from '../useTasks';

const ICONS: Readonly<Record<Exclude<TaskKind, 'mask'>, LucideIcon>> = {
  walk: Footprints,
  'stay-in': House,
  windows: AppWindow,
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

/** A gold star with the points on it, for a task: a star, as in a game, drawn as a true star at any width. */
function PointsStar({ points }: { readonly points: number }): React.JSX.Element {
  return (
    <span className="points-star tnum" role="img" aria-label={`${String(points)} points`}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <radialGradient id="star-gold" cx="38%" cy="30%" r="75%">
            <stop offset="0" stopColor="#ffe98a" />
            <stop offset="0.6" stopColor="#f7b500" />
            <stop offset="1" stopColor="#d99100" />
          </radialGradient>
        </defs>
        <path
          d="M24 3.5l5.6 12.4 13.5 1.5-10 9.1 2.8 13.3L24 32.8 12.1 39.8l2.8-13.3-10-9.1 13.5-1.5z"
          fill="url(#star-gold)"
          stroke="#c98a00"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <span aria-hidden="true">+{points}</span>
    </span>
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
  const doneCount = tips.filter((t) => progress.done.has(t.id)).length;
  // Which tip the row is showing, for the dots under it.
  const row = useRef<HTMLUListElement>(null);
  const [shownTip, setShownTip] = useState(0);
  const whichTip = (): number => {
    const el = row.current;
    const first = el?.querySelector('li');
    if (el === null || first === null || first === undefined) return 0;
    const step = first.getBoundingClientRect().width + 10;
    return Math.min(tips.length - 1, Math.max(0, Math.round(el.scrollLeft / step)));
  };
  const goToTip = (index: number): void => {
    const el = row.current;
    const target = el?.querySelectorAll('li')[index];
    if (el === null || target === undefined) return;
    setShownTip(index);
    // A browser without smooth scrolling just does not move; the dot still says where it went.
    (el as Partial<HTMLElement>).scrollTo?.({
      left: target.offsetLeft - el.offsetLeft,
      behavior: 'smooth',
    });
  };

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
        <ul
          ref={row}
          className="tips-row"
          aria-label="Tips, swipe for more"
          onScroll={() => {
            setShownTip(whichTip());
          }}
        >
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
                <span className={`task-icon task-${task.kind}`}>
                  {Icon === undefined ? (
                    <MaskIcon size={20} />
                  ) : (
                    <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                  )}
                </span>
                <span className="task-words">
                  <strong>{task.title}</strong>
                  <span className="muted small">{task.why}</span>
                </span>
                <PointsStar points={task.points} />
              </li>
            );
          })}
        </ul>
      )}
      {tips.length > 1 && (
        <div className="carousel-dots" role="group" aria-label="Which tip">
          {tips.map((task, index) => (
            <button
              key={task.id}
              type="button"
              className={index === shownTip ? 'dot on' : 'dot'}
              aria-label={`Tip ${String(index + 1)} of ${String(tips.length)}`}
              aria-current={index === shownTip}
              onClick={() => {
                goToTip(index);
              }}
            />
          ))}
        </div>
      )}
      <div className="tips-footer">
        <Progress progress={progress} />
      </div>
    </section>
  );
}
