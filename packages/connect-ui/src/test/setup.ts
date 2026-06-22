import { afterEach } from 'vitest';

// Real app stylesheet so Tailwind utilities + theme CSS variables resolve in the browser.
// Without this, axe's color-contrast checks have no computed colors to evaluate.
import '@/index.css';

// vitest-browser-react auto-unmounts the rendered tree between tests, and renderApp resets the
// store on each render — so here we only need to undo any theme class a test left behind.
afterEach(() => {
    document.documentElement.classList.remove('dark');
});
