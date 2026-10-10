/**
 * A cigarette, lying at an angle. Grey outline when it is off; when `lit`, a white body, an orange filter and
 * a glowing ember.
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
      className="cig-icon"
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
    </svg>
  );
}
