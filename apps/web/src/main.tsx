import '@fontsource-variable/hanken-grotesk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DeviceShell } from './demo/DeviceShell';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html needs a #root');

/** `?embed` is the app on its own: what runs inside a device frame, or on a real phone. Without it, the prototype shell. */
const alone = new URLSearchParams(window.location.search).has('embed');
if (alone) document.documentElement.classList.add('embedded');

createRoot(root).render(<StrictMode>{alone ? <App /> : <DeviceShell />}</StrictMode>);
