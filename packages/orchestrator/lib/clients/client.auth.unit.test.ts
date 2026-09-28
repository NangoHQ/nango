import { generateKeyPairSync } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR,
    INTERNAL_SERVICE_ISSUER_JOBS,
    INTERNAL_SERVICE_ISSUER_SERVER,
    INTERNAL_SERVICE_TOKEN_TTL_SECS,
    keyRegistryFromPublicKeys,
    verify
} from '@nangohq/internal-auth';

import { OrchestratorClient } from './client.js';

import type { ImmediateProps } from './types.js';

const { mockEnvs } = vi.hoisted(() => ({
    mockEnvs: {
        NANGO_INTERNAL_AUTH_TOKEN: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_JOBS_KEY_ID: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_SERVER_PRIVATE_KEY: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_SERVER_KEY_ID: undefined as string | undefined
    }
}));

vi.mock('../env.js', () => ({
    envs: mockEnvs
}));

function ed25519Material(): { pem: string; raw: string } {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    return {
        pem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
        raw: Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
            .subarray(12)
            .toString('base64url')
    };
}

function immediateProps(): ImmediateProps {
    return {
        name: 'task-1',
        group: { key: 'group-1', maxConcurrency: 0 },
        retry: { count: 0, max: 0 },
        timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
        args: {
            type: 'action',
            actionName: 'action-1',
            connection: {
                id: 123,
                connection_id: 'connection-1',
                provider_config_key: 'provider-config-key-1',
                environment_id: 456
            },
            activityLogId: 'activity-log-1',
            input: { foo: 'bar' },
            async: false
        }
    };
}

function authorizationHeader(fetchMock: ReturnType<typeof vi.fn>): string | undefined {
    const init = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    return init?.headers?.['Authorization'];
}

function tokenLifetimeSecs(token: string): number {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { iat?: unknown; exp?: unknown };
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
        throw new Error('expected iat and exp');
    }
    return payload.exp - payload.iat;
}

describe('OrchestratorClient service tokens', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        mockEnvs.NANGO_INTERNAL_AUTH_TOKEN = undefined;
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY = undefined;
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_KEY_ID = undefined;
        mockEnvs.NANGO_INTERNAL_AUTH_SERVER_PRIVATE_KEY = undefined;
        mockEnvs.NANGO_INTERNAL_AUTH_SERVER_KEY_ID = undefined;
    });

    it('sends the static token when the caller private key is unset', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_TOKEN = 'shared';
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ taskId: 'task-1', retryKey: 'retry-key-1' }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test', service: 'jobs' });
        const res = await client.immediate(immediateProps());
        expect(res.isOk()).toBe(true);
        expect(authorizationHeader(fetchMock)).toBe('Bearer shared');
    });

    it('sends a jobs service token when the jobs private key is set', async () => {
        const jobs = ed25519Material();
        mockEnvs.NANGO_INTERNAL_AUTH_TOKEN = 'shared';
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY = jobs.pem;
        mockEnvs.NANGO_INTERNAL_AUTH_JOBS_KEY_ID = 'jobs-2026-09';
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ taskId: 'task-1', retryKey: 'retry-key-1' }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test', service: 'jobs' });
        const res = await client.immediate(immediateProps());
        expect(res.isOk()).toBe(true);
        const header = authorizationHeader(fetchMock);
        expect(header?.startsWith('Bearer ')).toBe(true);
        const token = header?.slice('Bearer '.length) ?? '';
        const registry = keyRegistryFromPublicKeys(`jobs-2026-09:${jobs.raw}`, INTERNAL_SERVICE_ISSUER_JOBS);
        expect(await verify(token, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, registry)).toMatchObject({
            kind: 'jwt',
            sub: INTERNAL_SERVICE_ISSUER_JOBS,
            issuer: INTERNAL_SERVICE_ISSUER_JOBS
        });
        expect(tokenLifetimeSecs(token)).toBe(INTERNAL_SERVICE_TOKEN_TTL_SECS);
    });

    it('sends a server service token when the server private key is set', async () => {
        const server = ed25519Material();
        mockEnvs.NANGO_INTERNAL_AUTH_SERVER_PRIVATE_KEY = server.pem;
        mockEnvs.NANGO_INTERNAL_AUTH_SERVER_KEY_ID = 'server-2026-09';
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ taskId: 'task-1', retryKey: 'retry-key-1' }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test', service: 'server' });
        const res = await client.immediate(immediateProps());
        expect(res.isOk()).toBe(true);
        const token = authorizationHeader(fetchMock)?.slice('Bearer '.length) ?? '';
        const registry = keyRegistryFromPublicKeys(`server-2026-09:${server.raw}`, INTERNAL_SERVICE_ISSUER_SERVER);
        expect(await verify(token, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, registry)).toMatchObject({
            kind: 'jwt',
            sub: INTERNAL_SERVICE_ISSUER_SERVER,
            issuer: INTERNAL_SERVICE_ISSUER_SERVER
        });
        expect(tokenLifetimeSecs(token)).toBe(INTERNAL_SERVICE_TOKEN_TTL_SECS);
    });
});
