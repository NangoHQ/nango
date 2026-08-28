import { afterEach, describe, expect, it, vi } from 'vitest';

import { exportRunnerPublicKey } from '@nangohq/internal-auth';

import { envForRunnerProcess } from './local.js';

const { mockEnvs } = vi.hoisted(() => ({
    mockEnvs: {
        PROVIDERS_RELOAD_INTERVAL: 60_000,
        NANGO_INTERNAL_AUTH_SIGNING_KEY: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_REQUIRED: false
    }
}));

vi.mock('../env.js', () => ({
    envs: mockEnvs
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

afterEach(() => {
    mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = undefined;
    mockEnvs.NANGO_INTERNAL_AUTH_REQUIRED = false;
});

describe('envForRunnerProcess', () => {
    it('strips control-plane secrets and injects fleet tokens plus the Ed25519 public key', () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        mockEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const env = envForRunnerProcess(7, {
            PATH: '/usr/bin',
            NANGO_INTERNAL_AUTH_TOKEN: 'shared',
            NANGO_INTERNAL_AUTH_SIGNING_KEY: 'sign'
        });
        expect(env['NANGO_INTERNAL_AUTH_TOKEN']).toBeUndefined();
        expect(env['NANGO_INTERNAL_AUTH_SIGNING_KEY']).toBeUndefined();
        expect(env['NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY']).toBe(exportRunnerPublicKey('sign'));
        expect(env['NANGO_INTERNAL_AUTH_REQUIRED']).toBe('true');
        expect(env['PATH']).toBe('/usr/bin');
        expect(env['NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN']).toBeTruthy();
        expect(env['NANGO_INTERNAL_AUTH_REGISTER_TOKEN']).toBeUndefined();
        expect(env['NANGO_INTERNAL_AUTH_IDLE_TOKEN']).toBeUndefined();
    });
});
