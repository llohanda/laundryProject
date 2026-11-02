import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

// iOS Safari ignores user-scalable=no; block pinch zoom explicitly (GDD 3.2).
for (const type of ['gesturestart', 'gesturechange']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
