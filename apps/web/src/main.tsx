import '@fontsource-variable/hanken-grotesk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html needs a #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
