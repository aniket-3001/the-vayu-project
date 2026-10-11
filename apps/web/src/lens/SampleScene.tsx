/** The kinds of place the Lens can stand in. */
export type ScenePlace = 'home' | 'school' | 'work' | 'park' | 'street';

export const SCENE_LABELS: Readonly<Record<ScenePlace, string>> = {
  home: 'home',
  school: 'school',
  work: 'office',
  park: 'park',
  street: 'street',
};

/** Which scene a pinned place gets, from its name. Anything else, and a place found by location, is the street. */
export function sceneFor(name: string): ScenePlace {
  if (/\b(home|house|flat|apartment)\b/iu.test(name)) return 'home';
  if (/\b(school|college|campus|university)\b/iu.test(name)) return 'school';
  if (/\b(office|work|workplace)\b/iu.test(name)) return 'work';
  if (/\b(park|garden|ground)\b/iu.test(name)) return 'park';
  return 'street';
}

const Sky = ({ night }: { readonly night: boolean }): React.JSX.Element => (
  <>
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={night ? '#b3bfd3' : '#bfe0f5'} />
        <stop offset="1" stopColor={night ? '#dbe2ee' : '#f3f8fc'} />
      </linearGradient>
    </defs>
    <rect x="-2400" width="5200" height="700" fill="url(#sky)" />
    {night ? (
      <circle cx="310" cy="120" r="22" fill="#f5f1e3" />
    ) : (
      <circle cx="310" cy="130" r="26" fill="#fbe9a8" />
    )}
  </>
);

const Tree = ({
  x,
  y,
  s = 1,
}: {
  readonly x: number;
  readonly y: number;
  readonly s?: number;
}): React.JSX.Element => (
  <g transform={`translate(${String(x)} ${String(y)}) scale(${String(s)})`}>
    <rect x="-4" y="0" width="8" height="70" fill="#b9a58c" />
    <circle cx="0" cy="-10" r="46" fill="#a8cf9a" />
    <circle cx="-30" cy="10" r="30" fill="#9cc58d" />
    <circle cx="32" cy="10" r="32" fill="#9cc58d" />
  </g>
);

function Street(): React.JSX.Element {
  return (
    <>
      <g fill="#cdd8e6">
        <rect x="10" y="330" width="46" height="150" rx="2" />
        <rect x="62" y="300" width="38" height="180" rx="2" />
        <rect x="106" y="350" width="52" height="130" rx="2" />
        <rect x="236" y="310" width="44" height="170" rx="2" />
        <rect x="286" y="340" width="56" height="140" rx="2" />
        <rect x="348" y="290" width="44" height="190" rx="2" />
      </g>
      <g fill="#b7c6d9">
        <rect x="0" y="400" width="84" height="130" rx="3" />
        <rect x="90" y="380" width="70" height="150" rx="3" />
        <rect x="300" y="395" width="100" height="135" rx="3" />
      </g>
      <g fill="#9fb2c8">
        <rect x="14" y="420" width="10" height="12" />
        <rect x="32" y="420" width="10" height="12" />
        <rect x="14" y="446" width="10" height="12" />
        <rect x="32" y="446" width="10" height="12" />
        <rect x="104" y="404" width="10" height="12" />
        <rect x="124" y="404" width="10" height="12" />
        <rect x="324" y="420" width="10" height="12" />
        <rect x="346" y="420" width="10" height="12" />
        <rect x="368" y="420" width="10" height="12" />
      </g>
      <rect y="520" x="-2400" width="5200" height="180" fill="#dfe6ef" />
      <rect y="600" x="-2400" width="5200" height="100" fill="#cfd8e4" />
      <g fill="#f7fafc">
        <rect x="40" y="648" width="60" height="6" rx="3" />
        <rect x="170" y="648" width="60" height="6" rx="3" />
        <rect x="300" y="648" width="60" height="6" rx="3" />
      </g>
      <Tree x={200} y={450} />
    </>
  );
}

/** A room, with a window onto the sky: a sofa, a lamp, a plant. */
function Home(): React.JSX.Element {
  return (
    <>
      <rect y="0" x="-2400" width="5200" height="700" fill="#f2e9dd" />
      <rect y="560" x="-2400" width="5200" height="140" fill="#dcc8ac" />
      <rect y="548" x="-2400" width="5200" height="14" fill="#e9dcc7" />
      {/* the window, showing the sky and a far roof line */}
      <rect x="86" y="120" width="228" height="290" rx="6" fill="#ffffff" />
      <rect x="98" y="132" width="204" height="266" rx="3" fill="url(#sky)" />
      <rect x="98" y="330" width="204" height="68" fill="#cdd8e6" />
      <rect x="130" y="306" width="40" height="30" fill="#b7c6d9" />
      <rect x="196" y="316" width="52" height="20" fill="#b7c6d9" />
      <rect x="198" y="132" width="4" height="266" fill="#ffffff" />
      <rect x="98" y="262" width="204" height="4" fill="#ffffff" />
      <path d="M86 120 q-30 90 -22 250 h26 v-250Z" fill="#d6e6d2" />
      <path d="M314 120 q30 90 22 250 h-26 v-250Z" fill="#d6e6d2" />
      {/* sofa */}
      <rect x="60" y="470" width="280" height="96" rx="22" fill="#b9c9dd" />
      <rect x="46" y="500" width="40" height="76" rx="16" fill="#a7b9d1" />
      <rect x="314" y="500" width="40" height="76" rx="16" fill="#a7b9d1" />
      <rect x="92" y="450" width="96" height="60" rx="14" fill="#c8d6e8" />
      <rect x="212" y="450" width="96" height="60" rx="14" fill="#c8d6e8" />
      {/* lamp and plant */}
      <rect x="364" y="430" width="6" height="130" fill="#b9a58c" />
      <path d="M346 430 h42 l-10 -40 h-22Z" fill="#fbe9a8" />
      <rect x="14" y="520" width="34" height="42" rx="6" fill="#d9a98b" />
      <path
        d="M31 520 q-26 -50 -4 -90 q8 40 12 90 M31 520 q22 -46 8 -84 q-14 36 -8 84"
        fill="#9cc58d"
      />
    </>
  );
}

/** A school building with a flag, a gate, and a playground in front. */
function School(): React.JSX.Element {
  return (
    <>
      <rect y="470" x="-2400" width="5200" height="230" fill="#cfe3c4" />
      <rect y="560" x="-2400" width="5200" height="140" fill="#dfe6ef" />
      <rect x="30" y="300" width="340" height="200" rx="4" fill="#f0d9c0" />
      <path d="M20 304 L200 232 L380 304Z" fill="#d9a98b" />
      <rect x="170" y="400" width="60" height="100" rx="4" fill="#b9a58c" />
      <g fill="#bfe0f5">
        <rect x="52" y="330" width="40" height="44" rx="2" />
        <rect x="108" y="330" width="40" height="44" rx="2" />
        <rect x="252" y="330" width="40" height="44" rx="2" />
        <rect x="308" y="330" width="40" height="44" rx="2" />
        <rect x="52" y="410" width="40" height="44" rx="2" />
        <rect x="108" y="410" width="40" height="44" rx="2" />
        <rect x="252" y="410" width="40" height="44" rx="2" />
        <rect x="308" y="410" width="40" height="44" rx="2" />
      </g>
      <rect x="198" y="170" width="4" height="70" fill="#b9a58c" />
      <path d="M202 172 h42 l-10 12 l10 12 h-42Z" fill="#f0a24a" />
      {/* playground: a slide and a swing */}
      <g fill="none" stroke="#e9857b" strokeWidth="6" strokeLinecap="round">
        <path d="M40 640 L70 560 M100 640 L70 560 M70 560 L130 640" />
      </g>
      <g stroke="#7aa6d8" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M250 640 L270 540 M330 640 L310 540 M270 540 H310 M283 540 V610 M297 540 V610" />
      </g>
      <rect x="276" y="608" width="28" height="6" rx="3" fill="#7aa6d8" />
      <Tree x={20} y={470} s={0.7} />
      <Tree x={382} y={470} s={0.7} />
    </>
  );
}

/** Office towers with glass and many windows, a plaza and a tree. */
function Work(): React.JSX.Element {
  const windows: React.JSX.Element[] = [];
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 5; col++)
      windows.push(
        <rect
          key={`a${String(row)}-${String(col)}`}
          x={120 + col * 30}
          y={230 + row * 30}
          width="20"
          height="18"
          rx="2"
        />,
      );
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 3; col++)
      windows.push(
        <rect
          key={`b${String(row)}-${String(col)}`}
          x={278 + col * 30}
          y={310 + row * 30}
          width="20"
          height="18"
          rx="2"
        />,
      );
  return (
    <>
      <rect x="100" y="200" width="170" height="340" rx="4" fill="#b7c6d9" />
      <rect x="262" y="290" width="120" height="250" rx="4" fill="#cdd8e6" />
      <rect x="10" y="350" width="80" height="190" rx="4" fill="#cdd8e6" />
      <g fill="#e3f1fb">{windows}</g>
      <g fill="#e3f1fb">
        <rect x="24" y="370" width="16" height="14" rx="2" />
        <rect x="52" y="370" width="16" height="14" rx="2" />
        <rect x="24" y="400" width="16" height="14" rx="2" />
        <rect x="52" y="400" width="16" height="14" rx="2" />
        <rect x="24" y="430" width="16" height="14" rx="2" />
        <rect x="52" y="430" width="16" height="14" rx="2" />
      </g>
      <rect y="540" x="-2400" width="5200" height="160" fill="#dfe6ef" />
      <rect y="600" x="-2400" width="5200" height="100" fill="#cfd8e4" />
      <rect x="150" y="500" width="100" height="40" rx="3" fill="#9fb2c8" />
      <rect x="186" y="500" width="28" height="40" fill="#e3f1fb" />
      <Tree x={60} y={500} s={0.75} />
      <g fill="#f7fafc">
        <rect x="60" y="648" width="60" height="6" rx="3" />
        <rect x="270" y="648" width="60" height="6" rx="3" />
      </g>
    </>
  );
}

/** A park: rolling green, a path, a bench and big trees. */
function Park(): React.JSX.Element {
  return (
    <>
      {/* the hills run on past both edges, so a wide screen is filled with more of them */}
      <rect x="-2400" y="430" width="2400" height="270" fill="#cfe3c4" />
      <rect x="400" y="400" width="2400" height="300" fill="#cfe3c4" />
      <path d="M0 430 Q120 360 250 420 T400 400 V700 H0Z" fill="#cfe3c4" />
      <rect x="-2400" y="500" width="2400" height="200" fill="#bcd8ae" />
      <rect x="400" y="490" width="2400" height="210" fill="#bcd8ae" />
      <path d="M0 500 Q140 450 260 500 T400 490 V700 H0Z" fill="#bcd8ae" />
      <path
        d="M150 700 Q190 600 230 540 Q250 510 262 500 L292 500 Q280 520 270 560 Q252 620 270 700Z"
        fill="#ead9bd"
      />
      <Tree x={50} y={400} s={1.15} />
      <Tree x={350} y={390} s={1.25} />
      <Tree x={210} y={440} s={0.7} />
      {/* a bench */}
      <g fill="#b9a58c">
        <rect x="60" y="590" width="100" height="10" rx="3" />
        <rect x="60" y="566" width="100" height="8" rx="3" />
        <rect x="68" y="600" width="8" height="26" />
        <rect x="144" y="600" width="8" height="26" />
      </g>
      {/* a few flowers */}
      <g fill="#f4b6c2">
        <circle cx="300" cy="620" r="5" />
        <circle cx="320" cy="640" r="5" />
        <circle cx="288" cy="650" r="5" />
      </g>
      <g fill="#fbe9a8">
        <circle cx="30" cy="660" r="4" />
        <circle cx="48" cy="680" r="4" />
      </g>
    </>
  );
}

const SCENES: Readonly<Record<ScenePlace, () => React.JSX.Element>> = {
  home: Home,
  school: School,
  work: Work,
  park: Park,
  street: Street,
};

/**
 * A stand-in for the camera: a calm scene in pale colours that matches where you are looking, a living room
 * for Home, a school with a playground, an office block, a park, or a street for anywhere else. So the Lens
 * still works on a laptop, or when the camera is off. It dims at night.
 */
export function SampleScene({
  night,
  place = 'street',
}: {
  readonly night: boolean;
  readonly place?: ScenePlace;
}): React.JSX.Element {
  const Scene = SCENES[place];
  return (
    <svg
      className="scene"
      data-place={place}
      viewBox="0 0 400 700"
      preserveAspectRatio="xMidYMax meet"
      role="img"
      aria-label={`An illustration of a ${SCENE_LABELS[place]}, standing in for the camera`}
    >
      <Sky night={night} />
      <Scene />
    </svg>
  );
}
