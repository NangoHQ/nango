import { afterEach, describe, expect, it, vi } from 'vitest';

describe('remote function runtime config', () => {
    const originalNangoServerUrl = process.env['NANGO_SERVER_URL'];

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();

        if (originalNangoServerUrl === undefined) {
            delete process.env['NANGO_SERVER_URL'];
        } else {
            process.env['NANGO_SERVER_URL'] = originalNangoServerUrl;
        }
    });

    it('prefers the public API URL for sandboxed CLI calls', async () => {
        process.env['NANGO_SERVER_URL'] = 'https://api.example.test';

        vi.resetModules();
        const { getRemoteFunctionNangoHost } = await import('./runtime.js');

        expect(getRemoteFunctionNangoHost()).toBe('https://api.example.test');
    });

    it('uses the configured server URL in cloud environments', async () => {
        process.env['NANGO_SERVER_URL'] = 'https://api-development.nango.dev';

        vi.resetModules();
        vi.stubEnv('NANGO_CLOUD', 'true');
        vi.stubEnv('NODE_ENV', 'production');
        const { getRemoteFunctionNangoHost } = await import('./runtime.js');

        expect(getRemoteFunctionNangoHost()).toBe('https://api-development.nango.dev');
    });

    it('rejects an empty compiler template instead of falling back silently', async () => {
        vi.stubEnv('E2B_SANDBOX_COMPILER_TEMPLATE', '');

        vi.resetModules();
        await expect(import('./runtime.js')).rejects.toThrow(/E2B_SANDBOX_COMPILER_TEMPLATE/);
    });
});
