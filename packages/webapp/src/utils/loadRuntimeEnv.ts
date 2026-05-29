export async function loadRuntimeEnv(): Promise<void> {
    const metaOrigin = document.querySelector('meta[name="nango-api-origin"]')?.getAttribute('content');
    const envHash = document.querySelector('meta[name="nango-env-hash"]')?.getAttribute('content');
    const envJsPath = metaOrigin ? `${metaOrigin.replace(/\/$/, '')}/env.js` : '/env.js';
    const envJsUrl = envHash ? `${envJsPath}?hash=${encodeURIComponent(envHash)}` : envJsPath;

    await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = envJsUrl;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load runtime env from ${envJsUrl}`));
        document.head.appendChild(script);
    });

    if (!window._env) {
        throw new Error('env.js did not set window._env');
    }
}
