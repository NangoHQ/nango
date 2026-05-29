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
