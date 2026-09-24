import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WindowEnv } from '@nangohq/types';
import type { Request, Response } from 'express';

// getEnvJs only reads `envs` from @nangohq/logs. Stubbing it keeps the module graph light so the
// dynamic re-imports below stay cheap.
vi.mock('@nangohq/logs', () => ({
    envs: {
        GIT_HASH: undefined,
        PUBLIC_SENTRY_KEY: '',
        PUBLIC_POSTHOG_KEY: '',
        PUBLIC_POSTHOG_HOST: '',
        PUBLIC_LOGODEV_KEY: '',
        PUBLIC_STRIPE_KEY: '',
        PLAIN_APP_ID: '',
        NANGO_LOGS_ENABLED: false,
        AUTH_ALLOW_SIGNUP: true
    }
}));

const SERVER_URL = 'https://nango.example.com';
const DASHBOARD_API_URL = 'https://nango.internal.example.com';

/**
 * @nangohq/utils computes `baseUrl` / `dashboardApiUrl` from process.env at module load, so the env
 * has to be stubbed before a fresh import of the whole chain.
 */
async function renderEnvJs(env: Record<string, string | undefined>): Promise<WindowEnv> {
    vi.resetModules();
    vi.stubEnv('NANGO_SERVER_URL', SERVER_URL);
    for (const [key, value] of Object.entries(env)) {
        vi.stubEnv(key, value);
    }

    const { getEnvJs } = await import('./getEnvJs.js');

    let body = '';
    const res = {
        setHeader: vi.fn(),
        set: vi.fn(),
        send: vi.fn((payload: string) => {
            body = payload;
        })
    } as unknown as Response;

    // getEnvJs is synchronous, but RequestHandler is typed as possibly returning a promise.
    void getEnvJs({} as Request, res, vi.fn());

    const json = body.replace(/^window\._env = /, '').replace(/;$/, '');
    return JSON.parse(json) as WindowEnv;
}

describe('getEnvJs', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    const testCases = [
        {
            name: 'falls back to apiUrl when NANGO_DASHBOARD_API_URL is not set',
            env: { NANGO_DASHBOARD_API_URL: undefined },
            expected: { apiUrl: SERVER_URL, dashboardApiUrl: SERVER_URL }
        },
        {
            name: 'moves only dashboardApiUrl when NANGO_DASHBOARD_API_URL is set, leaving apiUrl on NANGO_SERVER_URL',
            env: { NANGO_DASHBOARD_API_URL: DASHBOARD_API_URL },
            expected: { apiUrl: SERVER_URL, dashboardApiUrl: DASHBOARD_API_URL }
        },
        {
            name: 'emits `/` when NANGO_DASHBOARD_API_URL is `/`, leaving apiUrl on NANGO_SERVER_URL',
            env: { NANGO_DASHBOARD_API_URL: '/' },
            expected: { apiUrl: SERVER_URL, dashboardApiUrl: '/' }
        }
    ];

    for (const testCase of testCases) {
        it(testCase.name, async () => {
            const config = await renderEnvJs(testCase.env);

            expect(config.apiUrl).toBe(testCase.expected.apiUrl);
            expect(config.dashboardApiUrl).toBe(testCase.expected.dashboardApiUrl);
        });
    }
});
