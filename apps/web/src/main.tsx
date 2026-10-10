import '@fontsource-variable/hanken-grotesk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DeviceShell } from './demo/DeviceShell';
import { applyScenario, scenarioById } from './demo/scenarios';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html needs a #root');

/** `?embed` is the app on its own: what runs inside a device frame, or on a real phone. Without it, the prototype shell. */
/** `?demo=grap` stages a scenario before the app opens: a link that shows one feature on a real phone. */
const staged = scenarioById(new URLSearchParams(window.location.search).get('demo'));
if (staged !== undefined) {
  const route = applyScenario(window.localStorage, staged);
  if (new URLSearchParams(window.location.search).has('embed')) window.location.hash = route;
}

const alone = new URLSearchParams(window.location.search).has('embed');
if (alone) document.documentElement.classList.add('embedded');

createRoot(root).render(<StrictMode>{alone ? <App /> : <DeviceShell />}</StrictMode>);
