import { afterEach, describe, expect, it, vi } from 'vitest';

describe('function controller helpers', () => {
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

    it('uses the configured server URL for function callbacks', async () => {
        vi.stubEnv('NANGO_SERVER_URL', 'https://api.example.test');

        vi.resetModules();
        const { getFunctionCallbackBaseUrl } = await import('./helpers.js');

        expect(getFunctionCallbackBaseUrl()).toBe('https://api.example.test');
    });
});
