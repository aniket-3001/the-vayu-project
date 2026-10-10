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
import { MaskIcon } from '../../today/ui/icons';
import { POINTS, type Task, type TaskKind } from '../model';
import { Carousel } from '../../alerts/ui/Carousel';
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
        <Flame size={16} strokeWidth={2} aria-hidden="true" />
        {progress.streak === 0 ? 'No streak yet' : `${String(progress.streak)}-day streak`}
      </span>
      <span className="stat">
        <Star size={16} strokeWidth={2} aria-hidden="true" />
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

/** Small things worth doing today to breathe better, given the air. Tick them off for points and a streak. */
export function TipsCard({
  tips,
  placeName,
}: {
  readonly tips: readonly Task[];
  readonly placeName: string;
}): React.JSX.Element {
  const progress = useTasks();
  const reduced = useReducedMotion() === true;
  const doneCount = tips.filter((t) => progress.done.has(t.id)).length;

  return (
    <Carousel
      title="Breathe better today"
      hint={`Tips for ${placeName}, given the air`}
      className="tips"
      aside={<Ring done={doneCount} total={tips.length} />}
    >
      {tips.map((task) => {
        const checked = progress.done.has(task.id);
        const Icon = task.kind === 'mask' ? undefined : ICONS[task.kind];
        return (
          <li key={task.id} className={checked ? 'tip done' : 'tip'}>
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
            <span className="task-icon">
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
            <span className="task-points tnum">+{task.points}</span>
          </li>
        );
      })}
      <li className="tip-stat">
        <Progress progress={progress} />
      </li>
    </Carousel>
  );
}
