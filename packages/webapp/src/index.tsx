// Mantine styles power the <CodeHighlight> code blocks. The .layer.css variants scope Mantine
// into an `@layer mantine` so Tailwind/app styles (loaded after) keep priority.
import '@mantine/core/styles.layer.css';
import '@mantine/code-highlight/styles.layer.css';

import './index.css';

import { loadRuntimeEnv } from './utils/loadRuntimeEnv';

async function bootstrap() {
    try {
        await loadRuntimeEnv();
        await import('./main');
    } catch (err) {
        console.error('Failed to bootstrap Nango webapp', err);
        document.body.innerHTML = '<p>Failed to load application configuration. Please refresh the page.</p>';
    }
}

void bootstrap();
