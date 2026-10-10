/**
 * A stand-in for the camera: a calm street scene in pale colours, so the Lens still works on a laptop,
 * in a prototype frame, or when the camera is off. It dims at night.
 */
export function SampleScene({ night }: { readonly night: boolean }): React.JSX.Element {
  const sky = night ? ['#b3bfd3', '#dbe2ee'] : ['#bfe0f5', '#f3f8fc'];
  return (
    <svg
      className="scene"
      viewBox="0 0 400 700"
      preserveAspectRatio="xMidYMax slice"
      role="img"
      aria-label="A sample street scene, standing in for the camera"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="700" fill="url(#sky)" />
      {night ? (
        <circle cx="310" cy="120" r="22" fill="#f5f1e3" />
      ) : (
        <circle cx="310" cy="130" r="26" fill="#fbe9a8" />
      )}
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
      <rect x="0" y="520" width="400" height="180" fill="#dfe6ef" />
      <rect x="0" y="600" width="400" height="100" fill="#cfd8e4" />
      <g fill="#f7fafc">
        <rect x="40" y="648" width="60" height="6" rx="3" />
        <rect x="170" y="648" width="60" height="6" rx="3" />
        <rect x="300" y="648" width="60" height="6" rx="3" />
      </g>
      <rect x="196" y="440" width="8" height="90" fill="#b9a58c" />
      <circle cx="200" cy="420" r="46" fill="#a8cf9a" />
      <circle cx="170" cy="440" r="30" fill="#9cc58d" />
      <circle cx="232" cy="440" r="32" fill="#9cc58d" />
    </svg>
  );
}
