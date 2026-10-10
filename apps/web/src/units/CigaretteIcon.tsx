/**
 * A cigarette, lying at an angle, with smoke curling up from its ember. It is always moving: the ember glows and
 * three puffs rise and fade. Grey outline when it is off, with only a faint wisp; when `lit`, a white body, an
 * orange filter and a glowing ember with fuller smoke. Still, with the smoke held, for people who ask for less
 * motion.
 */
export function CigaretteIcon({
  size = 22,
  lit = false,
}: {
  readonly size?: number;
  readonly lit?: boolean;
}): React.JSX.Element {
  const stroke = lit ? '#8a96a8' : 'currentColor';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`cig-icon${lit ? ' lit' : ' idle'}`}
      style={{ overflow: 'visible' }}
    >
      <g transform="rotate(-35 12 12)" strokeLinejoin="round" strokeWidth="1.6">
        <rect
          x="2.5"
          y="9.5"
          width="6.5"
          height="5"
          rx="1.2"
          fill={lit ? '#e0953f' : 'none'}
          stroke={lit ? '#b8702a' : stroke}
        />
        <rect x="9" y="9.5" width="10" height="5" fill={lit ? '#ffffff' : 'none'} stroke={stroke} />
        <rect
          x="19"
          y="9.5"
          width="3"
          height="5"
          rx="1.2"
          fill={lit ? '#ff6a2b' : 'none'}
          stroke={lit ? '#d9481a' : stroke}
        />
      </g>
      {lit && <circle cx="20.4" cy="6.2" r="1.7" className="cig-ember" />}
      <circle cx="20.6" cy="5.6" r="1.7" className="cig-puff p1" />
      <circle cx="20.2" cy="5.2" r="1.3" className="cig-puff p2" />
      <circle cx="20.8" cy="5.8" r="1.5" className="cig-puff p3" />
    </svg>
  );
}
