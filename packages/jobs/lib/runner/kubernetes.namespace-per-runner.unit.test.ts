import { beforeEach, describe, expect, it, vi } from 'vitest';

import { kubernetesNodeProvider } from './kubernetes.js';

import type { Node } from '@nangohq/fleet';

const { getInternalTlsEnvMock, k8sMock, mockK8sEnvs } = vi.hoisted(() => ({
    getInternalTlsEnvMock: vi.fn<() => Record<string, string>>(() => ({})),
    k8sMock: {
        calls: [] as { method: string; body?: any; name?: string }[],
        errors: new Map<string, { reason: string }>()
    },
    mockK8sEnvs: {
        NODE_ENV: 'test',
        NANGO_CLOUD: false,
        RUNNER_NAMESPACE: 'runners',
        JOBS_NAMESPACE: 'nango',
        NAMESPACE_PER_RUNNER: true,
        NANGO_RUNNER_URL_SCHEME: 'http',
        RUNNER_DO_NOT_DISRUPT: false,
        NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED: false,
        NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST: [] as string[],
        NANGO_OUTBOUND_URL_POLICY: null as unknown,
        PROVIDERS_RELOAD_INTERVAL: 60_000,
        RUNNER_MAX_REQUEST_CPU: 2000,
        RUNNER_MAX_REQUEST_MEMORY: 4096,
        RUNNER_MIN_REQUEST_CPU: 100,
        RUNNER_MIN_REQUEST_MEMORY: 512,
        RUNNER_REQUEST_CPU_MULTIPLIER: 1.4,
        RUNNER_REQUEST_MEMORY_MULTIPLIER: 1.4,
        NANGO_INTERNAL_AUTH_RUNNER_SERVICE_ACCOUNT: 'nango-runner' as string | undefined
    }
}));

vi.mock('../env.js', () => ({
    get envs() {
        return mockK8sEnvs;
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

vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        getInternalTlsEnv: getInternalTlsEnvMock
    };
});

vi.mock('@kubernetes/client-node', () => {
    class ApiError extends Error {
        constructor(public body: string) {
            super(body);
        }
    }

    const record = (method: string) => (param: any) => {
        k8sMock.calls.push({ method, body: param?.body, name: param?.name });
        const err = k8sMock.errors.get(method);
        if (err) {
            throw new ApiError(JSON.stringify(err));
        }
        if (method === 'createNamespacedDeployment' || method === 'readNamespacedDeployment') {
            return Promise.resolve({
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                metadata: { name: param?.body?.metadata?.name ?? param?.name, uid: 'deploy-uid-1' }
            });
        }
        return Promise.resolve({});
    };

    const api = new Proxy({}, { get: (_target, method: string) => record(method) });

    class AppsV1Api {}
    class CoreV1Api {}
    class NetworkingV1Api {}
    class KubeConfig {
        loadFromDefault() {
            // no cluster in unit tests
        }
        makeApiClient() {
            return api;
        }
    }

    return { AppsV1Api, CoreV1Api, NetworkingV1Api, KubeConfig };
});

const node = { id: 1, routingId: 'account-7', image: 'runner:latest', cpuMilli: 500, memoryMb: 512, replicas: 1, idleMaxDurationMs: 1000 } as Node;

describe('ensureNamespace runner service account', () => {
    beforeEach(() => {
        k8sMock.calls = [];
        k8sMock.errors.clear();
        getInternalTlsEnvMock.mockReturnValue({});
        mockK8sEnvs.NANGO_INTERNAL_AUTH_RUNNER_SERVICE_ACCOUNT = 'nango-runner';
    });

    it('creates the runner ServiceAccount when NAMESPACE_PER_RUNNER is enabled', async () => {
        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const created = k8sMock.calls.find((call) => call.method === 'createNamespacedServiceAccount');
        expect(created?.body).toMatchObject({ metadata: { name: 'nango-runner' } });
    });

    it('propagates non-AlreadyExists ServiceAccount create failures', async () => {
        k8sMock.errors.set('createNamespacedServiceAccount', { reason: 'Forbidden' });

        const res = await kubernetesNodeProvider.start(node);
        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            expect(res.error.message).toBe('Failed to create runner service account');
        }
    });
});
