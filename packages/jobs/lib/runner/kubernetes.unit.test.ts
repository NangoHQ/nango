import { describe, expect, it, vi } from 'vitest';

import { getTlsEnvVars, getTlsSecretName } from './kubernetes.js';

vi.mock('../env.js', () => ({
    envs: {
        RUNNER_NAMESPACE: 'runners',
        JOBS_NAMESPACE: 'nango',
        NAMESPACE_PER_RUNNER: false,
        NANGO_RUNNER_URL_SCHEME: 'http'
    }
}));

vi.mock('@nangohq/shared', () => ({
    getJobsUrl: () => 'http://jobs',
    getPersistAPIUrl: () => 'http://persist',
    getProvidersUrl: () => 'http://providers'
}));

vi.mock('@nangohq/fleet', () => ({
    waitUntilHealthy: vi.fn()
}));

vi.mock('./runner.js', () => ({
    notifyOnIdle: vi.fn()
}));

const tlsEnv = {
    NANGO_INTERNAL_TLS_CERT: '-----BEGIN CERTIFICATE-----\ncert\n-----END CERTIFICATE-----',
    NANGO_INTERNAL_TLS_KEY: '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----',
    NANGO_INTERNAL_TLS_CA: '-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----',
    NANGO_INTERNAL_TLS_KEY_PASSPHRASE: 'secret'
};

describe('getTlsEnvVars', () => {
    it('should return nothing when internal TLS is disabled', () => {
        expect(getTlsEnvVars('my-runner-1', {})).toEqual([]);
    });

    it('should reference the secret instead of inlining the assets', () => {
        expect(getTlsEnvVars('my-runner-1', tlsEnv)).toEqual([
            { name: 'NANGO_INTERNAL_TLS_CERT', valueFrom: { secretKeyRef: { name: 'my-runner-1-internal-tls', key: 'NANGO_INTERNAL_TLS_CERT' } } },
            { name: 'NANGO_INTERNAL_TLS_KEY', valueFrom: { secretKeyRef: { name: 'my-runner-1-internal-tls', key: 'NANGO_INTERNAL_TLS_KEY' } } },
            { name: 'NANGO_INTERNAL_TLS_CA', valueFrom: { secretKeyRef: { name: 'my-runner-1-internal-tls', key: 'NANGO_INTERNAL_TLS_CA' } } },
            {
                name: 'NANGO_INTERNAL_TLS_KEY_PASSPHRASE',
                valueFrom: { secretKeyRef: { name: 'my-runner-1-internal-tls', key: 'NANGO_INTERNAL_TLS_KEY_PASSPHRASE' } }
            }
        ]);
    });

    it('should never expose an asset as a literal value', () => {
        const envVars = getTlsEnvVars('my-runner-1', tlsEnv);

        expect(JSON.stringify(envVars)).not.toContain('BEGIN');
        for (const envVar of envVars) {
            expect(envVar.value).toBeUndefined();
        }
    });

    it('should scope the secret to the runner', () => {
        expect(getTlsSecretName('my-runner-1')).toBe('my-runner-1-internal-tls');
        expect(getTlsSecretName('my-runner-2')).toBe('my-runner-2-internal-tls');
    });
});
