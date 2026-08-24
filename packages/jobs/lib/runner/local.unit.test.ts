import { afterEach, describe, expect, it, vi } from 'vitest';

import { envForRunnerProcess } from './local.js';

vi.mock('../env.js', () => ({
    envs: { PROVIDERS_RELOAD_INTERVAL: 60_000 }
}));

vi.mock('@nangohq/shared', () => ({
    getProvidersUrl: () => 'http://providers'
}));

vi.mock('@nangohq/fleet', () => ({
    waitUntilHealthy: vi.fn()
}));

vi.mock('./runner.js', () => ({
    notifyOnIdle: vi.fn()
}));

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('envForRunnerProcess', () => {
    it('strips control-plane secrets and injects fleet tokens', () => {
        process.env['NANGO_INTERNAL_AUTH_SIGNING_KEY'] = 'sign';
        const env = envForRunnerProcess(7, {
            PATH: '/usr/bin',
            NANGO_INTERNAL_AUTH_TOKEN: 'shared',
            NANGO_INTERNAL_AUTH_SIGNING_KEY: 'sign'
        });
        expect(env['NANGO_INTERNAL_AUTH_TOKEN']).toBeUndefined();
        expect(env['NANGO_INTERNAL_AUTH_SIGNING_KEY']).toBeUndefined();
        expect(env['PATH']).toBe('/usr/bin');
        expect(env['NANGO_INTERNAL_AUTH_REGISTER_TOKEN']).toBeTruthy();
        expect(env['NANGO_INTERNAL_AUTH_IDLE_TOKEN']).toBeTruthy();
    });
});
