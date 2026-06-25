import { afterEach } from 'vitest';

// Real app stylesheet so Tailwind utilities + theme CSS variables resolve in the browser.
// Without this, axe's color-contrast checks have no computed colors to evaluate.
import '@/index.css';

// Disable CSS transitions/animations so toggling the theme mid-test doesn't leave axe scanning an
// element's color mid-transition (which produces flaky, false color-contrast failures).
const noMotionStyle = document.createElement('style');
noMotionStyle.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
document.head.appendChild(noMotionStyle);

// vitest-browser-react auto-unmounts the rendered tree between tests, and renderApp resets the
// store on each render — so here we only need to undo any theme class a test left behind.
afterEach(() => {
    document.documentElement.classList.remove('dark');
});
