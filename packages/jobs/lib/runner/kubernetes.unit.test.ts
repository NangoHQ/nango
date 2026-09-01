import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportRunnerPublicKey, INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS, verifyInternalServiceToken } from '@nangohq/internal-auth';

import { getAuthSecretName, getRunnerAuthEnvVars, getTlsEnvVars, getTlsSecretName, kubernetesNodeProvider } from './kubernetes.js';

import type { Node } from '@nangohq/fleet';

const { getInternalTlsEnvMock, k8sMock, mockEnvs, defaultRunnerEnvs } = vi.hoisted(() => {
    const defaultRunnerEnvs = {
        NODE_ENV: 'test',
        NANGO_CLOUD: false,
        RUNNER_NAMESPACE: 'runners',
        JOBS_NAMESPACE: 'nango',
        NAMESPACE_PER_RUNNER: false,
        NANGO_RUNNER_URL_SCHEME: 'http',
        RUNNER_DO_NOT_DISRUPT: false,
        NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED: false,
        NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST: [] as string[],
        NANGO_OUTBOUND_URL_POLICY: null as { blockPrivateIps?: boolean; blockLinkLocal?: boolean } | null,
        RUNNER_EGRESS_NANGO_POD_SELECTOR: {
            matchExpressions: [{ key: 'app.kubernetes.io/component', operator: 'In', values: ['persist', 'jobs', 'server'] }]
        } as { matchLabels?: Record<string, string>; matchExpressions?: { key: string; operator: string; values?: string[] }[] },
        RUNNER_EGRESS_NANGO_PORTS: [80],
        PROVIDERS_RELOAD_INTERVAL: 60_000,
        RUNNER_MAX_REQUEST_CPU: 2000,
        RUNNER_MAX_REQUEST_MEMORY: 4096,
        RUNNER_MIN_REQUEST_CPU: 100,
        RUNNER_MIN_REQUEST_MEMORY: 512,
        RUNNER_REQUEST_CPU_MULTIPLIER: 1.4,
        RUNNER_REQUEST_MEMORY_MULTIPLIER: 1.4,
        NANGO_INTERNAL_AUTH_SIGNING_KEY: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_TOKEN: undefined as string | undefined,
        NANGO_INTERNAL_AUTH_REQUIRED: false
    };
    return {
        getInternalTlsEnvMock: vi.fn<() => Record<string, string>>(() => ({})),
        k8sMock: {
            calls: [] as { method: string; body?: any; name?: string }[],
            errors: new Map<string, { reason: string }>(),
            /** Fail replaceNamespacedSecret only when setting ownerReferences (the link step). */
            failLink: false
        },
        defaultRunnerEnvs,
        mockEnvs: { ...defaultRunnerEnvs }
    };
});

vi.mock('../env.js', () => ({
    envs: mockEnvs
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

vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        getInternalTlsEnv: getInternalTlsEnvMock
    };
});

vi.mock('@kubernetes/client-node', () => {
    // The client reports API failures as an error carrying the serialized response body.
    class ApiError extends Error {
        constructor(public body: string) {
            super(body);
        }
    }

    const record = (method: string) => (param: any) => {
        k8sMock.calls.push({ method, body: param?.body, name: param?.name });
        const objectName = param?.name ?? param?.body?.metadata?.name;
        const err = (objectName ? k8sMock.errors.get(`${method}:${objectName}`) : undefined) ?? k8sMock.errors.get(method);
        if (err) {
            throw new ApiError(JSON.stringify(err));
        }
        if (method === 'replaceNamespacedSecret' && k8sMock.failLink && param?.body?.metadata?.ownerReferences) {
            throw new ApiError(JSON.stringify({ reason: 'Forbidden' }));
        }
        if (method === 'readNamespacedSecret') {
            return Promise.resolve({
                metadata: { name: param?.name, resourceVersion: '42', labels: { app: 'account-7-1' } },
                type: 'Opaque',
                data: { NANGO_INTERNAL_TLS_CERT: 'Y2VydA==' }
            });
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
const secretName = 'account-7-1-internal-tls';
const authSecretName = 'account-7-1-internal-auth';

function methodsCalled(): string[] {
    return k8sMock.calls.map((call) => call.method);
}

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

describe('getRunnerAuthEnvVars', () => {
    const authEnv = {
        NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN: 'node.jwt'
    };

    it('should return nothing when no fleet tokens are minted', () => {
        expect(getRunnerAuthEnvVars('my-runner-1', {})).toEqual([]);
    });

    it('should reference the secret instead of inlining the tokens', () => {
        expect(getRunnerAuthEnvVars('my-runner-1', authEnv)).toEqual([
            {
                name: 'NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN',
                valueFrom: { secretKeyRef: { name: 'my-runner-1-internal-auth', key: 'NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN' } }
            }
        ]);
    });

    it('should never expose a token as a literal value', () => {
        const envVars = getRunnerAuthEnvVars('my-runner-1', authEnv);
        expect(JSON.stringify(envVars)).not.toContain('node.jwt');
        for (const envVar of envVars) {
            expect(envVar.value).toBeUndefined();
        }
    });

    it('should scope the secret to the runner', () => {
        expect(getAuthSecretName('my-runner-1')).toBe('my-runner-1-internal-auth');
        expect(getAuthSecretName('my-runner-2')).toBe('my-runner-2-internal-auth');
    });
});

describe('runner TLS secret lifecycle', () => {
    beforeEach(() => {
        k8sMock.calls = [];
        k8sMock.errors.clear();
        k8sMock.failLink = false;
        Object.assign(mockEnvs, defaultRunnerEnvs);
        getInternalTlsEnvMock.mockReturnValue(tlsEnv);
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = undefined;
    });

    it('should create the secret before the deployment', async () => {
        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const called = methodsCalled();
        expect(called.indexOf('createNamespacedSecret')).toBeLessThan(called.indexOf('createNamespacedDeployment'));

        const secret = k8sMock.calls.find((call) => call.method === 'createNamespacedSecret')?.body;
        expect(secret.metadata.name).toBe(secretName);
        expect(secret.stringData).toEqual(tlsEnv);
    });

    it('should own the secret with the deployment so GC can collect it', async () => {
        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const called = methodsCalled();
        expect(called.indexOf('createNamespacedDeployment')).toBeLessThan(called.indexOf('replaceNamespacedSecret'));

        const linked = k8sMock.calls.find((call) => call.method === 'replaceNamespacedSecret')?.body;
        expect(linked.metadata.ownerReferences).toEqual([
            {
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                name: 'account-7-1',
                uid: 'deploy-uid-1',
                controller: false,
                blockOwnerDeletion: true
            }
        ]);
    });

    it('should not create a secret when internal TLS is disabled', async () => {
        getInternalTlsEnvMock.mockReturnValue({});
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = undefined;

        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);
        expect(methodsCalled()).not.toContain('createNamespacedSecret');
        expect(methodsCalled()).not.toContain('replaceNamespacedSecret');
    });

    it('should overwrite a secret left over from an earlier attempt', async () => {
        k8sMock.errors.set('createNamespacedSecret', { reason: 'AlreadyExists' });

        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const called = methodsCalled();
        expect(called.indexOf('readNamespacedSecret')).toBeLessThan(called.indexOf('replaceNamespacedSecret'));

        const overwritten = k8sMock.calls.filter((call) => call.method === 'replaceNamespacedSecret');
        expect(overwritten[0]?.name).toBe(secretName);
        expect(overwritten[0]?.body.stringData).toEqual(tlsEnv);
        expect(overwritten[0]?.body.metadata.resourceVersion).toBe('42');
        expect(overwritten.at(-1)?.body.metadata.ownerReferences?.[0]?.uid).toBe('deploy-uid-1');
    });

    it('should fail the node when the secret cannot be written', async () => {
        k8sMock.errors.set('createNamespacedSecret', { reason: 'Forbidden' });

        const res = await kubernetesNodeProvider.start(node);
        expect(res.isErr()).toBe(true);
        expect(methodsCalled()).not.toContain('createNamespacedDeployment');
    });

    it('should delete the secret if the deployment cannot be created', async () => {
        k8sMock.errors.set('createNamespacedDeployment', { reason: 'Forbidden' });
        k8sMock.errors.set('readNamespacedDeployment', { reason: 'NotFound' });

        const res = await kubernetesNodeProvider.start(node);
        expect(res.isErr()).toBe(true);
        expect(k8sMock.calls.find((call) => call.method === 'deleteNamespacedSecret')?.name).toBe(secretName);
        expect(methodsCalled()).toContain('readNamespacedDeployment');
    });

    it('should keep the secret when create fails but the deployment exists', async () => {
        k8sMock.errors.set('createNamespacedDeployment', { reason: 'Timeout' });

        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);
        expect(methodsCalled()).not.toContain('deleteNamespacedSecret');
        expect(methodsCalled()).toContain('readNamespacedDeployment');

        const linked = k8sMock.calls.find((call) => call.method === 'replaceNamespacedSecret')?.body;
        expect(linked.metadata.ownerReferences?.[0]?.uid).toBe('deploy-uid-1');
    });

    it('should keep the secret when create and the follow-up read both fail ambiguously', async () => {
        k8sMock.errors.set('createNamespacedDeployment', { reason: 'Timeout' });
        k8sMock.errors.set('readNamespacedDeployment', { reason: 'Timeout' });

        const res = await kubernetesNodeProvider.start(node);
        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toMatch(/Failed to verify deployment after create/);
        expect(methodsCalled()).not.toContain('deleteNamespacedSecret');
    });

    it('should roll back deployment and secret when ownership linking fails', async () => {
        k8sMock.failLink = true;

        const res = await kubernetesNodeProvider.start(node);
        expect(res.isErr()).toBe(true);
        expect(k8sMock.calls.find((call) => call.method === 'deleteNamespacedSecret')?.name).toBe(secretName);
        expect(k8sMock.calls.find((call) => call.method === 'deleteNamespacedDeployment')?.name).toBe('account-7-1');
        expect(methodsCalled()).not.toContain('createNamespacedService');
    });

    it('should delete the secret on termination', async () => {
        const res = await kubernetesNodeProvider.terminate(node);
        expect(res.isOk()).toBe(true);

        expect(k8sMock.calls.find((call) => call.method === 'deleteNamespacedSecret')?.name).toBe(secretName);
    });

    it('should delete the secret even once internal TLS is turned off', async () => {
        getInternalTlsEnvMock.mockReturnValue({});

        const res = await kubernetesNodeProvider.terminate(node);
        expect(res.isOk()).toBe(true);

        expect(k8sMock.calls.find((call) => call.method === 'deleteNamespacedSecret')?.name).toBe(secretName);
    });

    it('should ignore a missing secret on termination', async () => {
        k8sMock.errors.set('deleteNamespacedSecret', { reason: 'NotFound' });

        const res = await kubernetesNodeProvider.terminate(node);
        expect(res.isOk()).toBe(true);
    });

    it('should still delete the auth secret if TLS secret deletion fails', async () => {
        k8sMock.errors.set(`deleteNamespacedSecret:${secretName}`, { reason: 'Forbidden' });

        const res = await kubernetesNodeProvider.terminate(node);
        expect(res.isErr()).toBe(true);
        expect(k8sMock.calls.filter((call) => call.method === 'deleteNamespacedSecret').map((call) => call.name)).toEqual([secretName, authSecretName]);
    });
});

describe('runner NetworkPolicy egress', () => {
    beforeEach(() => {
        k8sMock.calls = [];
        k8sMock.errors.clear();
        k8sMock.failLink = false;
        Object.assign(mockEnvs, defaultRunnerEnvs);
        getInternalTlsEnvMock.mockReturnValue({});
    });

    function policyByName(name: string) {
        return k8sMock.calls.find((call) => call.method === 'createNamespacedNetworkPolicy' && call.body?.metadata?.name === name)?.body;
    }

    it('should leave default-deny ingress unchanged', async () => {
        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        expect(policyByName('default-deny-1')).toEqual({
            metadata: { name: 'default-deny-1' },
            spec: {
                podSelector: {},
                policyTypes: ['Ingress']
            }
        });
    });

    it('should leave allow-from-nango ingress unchanged', async () => {
        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        expect(policyByName('allow-from-nango-1').spec).toEqual({
            podSelector: {},
            ingress: [
                {
                    _from: [
                        {
                            namespaceSelector: {
                                matchLabels: { name: 'nango' }
                            }
                        }
                    ]
                }
            ],
            policyTypes: ['Ingress']
        });
    });

    it('should apply egress only to the runner pod, not the whole namespace', async () => {
        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        expect(policyByName('allow-egress-to-nango-and-internet-1').spec.podSelector).toEqual({
            matchLabels: { app: 'account-7-1' }
        });
        expect(policyByName('default-deny-1').spec.podSelector).toEqual({});
        expect(policyByName('allow-from-nango-1').spec.podSelector).toEqual({});
    });

    it('should allow egress to persist, jobs, and server on port 80 only', async () => {
        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const egress = policyByName('allow-egress-to-nango-and-internet-1').spec.egress;
        const nangoRule = egress.find((rule: { ports?: { port: number }[] }) => rule.ports?.some((p) => p.port === 80));
        expect(nangoRule).toEqual({
            to: [
                {
                    namespaceSelector: {
                        matchLabels: { name: 'nango' }
                    },
                    podSelector: {
                        matchExpressions: [{ key: 'app.kubernetes.io/component', operator: 'In', values: ['persist', 'jobs', 'server'] }]
                    }
                }
            ],
            ports: [{ protocol: 'TCP', port: 80 }]
        });
    });

    it('should use RUNNER_EGRESS_NANGO_POD_SELECTOR when set', async () => {
        mockEnvs.RUNNER_EGRESS_NANGO_POD_SELECTOR = {
            matchExpressions: [{ key: 'app', operator: 'In', values: ['persist', 'jobs', 'nango-server'] }]
        };

        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const egress = policyByName('allow-egress-to-nango-and-internet-1').spec.egress;
        const nangoRule = egress.find((rule: { ports?: { port: number }[] }) => rule.ports?.some((p) => p.port === 80));
        expect(nangoRule.to[0].podSelector).toEqual(mockEnvs.RUNNER_EGRESS_NANGO_POD_SELECTOR);
    });

    it('should use RUNNER_EGRESS_NANGO_PORTS when set', async () => {
        mockEnvs.RUNNER_EGRESS_NANGO_PORTS = [80, 443];

        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const egress = policyByName('allow-egress-to-nango-and-internet-1').spec.egress;
        const nangoRule = egress.find((rule: { ports?: { port: number }[] }) => rule.ports?.some((p) => p.port === 443));
        expect(nangoRule.ports).toEqual([
            { protocol: 'TCP', port: 80 },
            { protocol: 'TCP', port: 443 }
        ]);
    });

    it('should not select orchestrator, Datadog, or the whole nango namespace', async () => {
        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const spec = JSON.stringify(policyByName('allow-egress-to-nango-and-internet-1').spec.egress);
        expect(spec).not.toContain('orchestrator');
        expect(spec).not.toContain('datadog');
        const nangoRule = policyByName('allow-egress-to-nango-and-internet-1').spec.egress.find((rule: { ports?: { port: number }[] }) =>
            rule.ports?.some((p) => p.port === 80)
        );
        expect(nangoRule.to[0].namespaceSelector.matchLabels).toEqual(
            policyByName('allow-from-nango-1').spec.ingress[0]._from[0].namespaceSelector.matchLabels
        );
        expect(nangoRule.to[0].podSelector).not.toEqual({});
        expect(nangoRule.to[0].podSelector.matchLabels).toBeUndefined();
    });

    it('should allow DNS to kube-system CoreDNS and NodeLocal DNSCache', async () => {
        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const egress = policyByName('allow-egress-to-nango-and-internet-1').spec.egress;
        expect(egress).toContainEqual({
            to: [
                {
                    namespaceSelector: {
                        matchLabels: { 'kubernetes.io/metadata.name': 'kube-system' }
                    },
                    podSelector: {
                        matchExpressions: [{ key: 'k8s-app', operator: 'In', values: ['kube-dns', 'coredns'] }]
                    }
                }
            ],
            ports: [
                { protocol: 'UDP', port: 53 },
                { protocol: 'TCP', port: 53 }
            ]
        });
        expect(egress).toContainEqual({
            to: [{ ipBlock: { cidr: '169.254.20.10/32' } }],
            ports: [
                { protocol: 'UDP', port: 53 },
                { protocol: 'TCP', port: 53 }
            ]
        });
    });

    it('should except the default runner outbound CIDRs from 0.0.0.0/0', async () => {
        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const egress = policyByName('allow-egress-to-nango-and-internet-1').spec.egress;
        const internetRule = egress.find((rule: { to?: { ipBlock?: { cidr: string } }[] }) => rule.to?.[0]?.ipBlock?.cidr === '0.0.0.0/0');
        expect(internetRule.to[0].ipBlock.except).toEqual([
            '10.0.0.0/8',
            '100.64.0.0/10',
            '127.0.0.1/32',
            '169.254.0.0/16',
            '169.254.169.254/32',
            '172.16.0.0/12',
            '192.168.0.0/16'
        ]);
    });

    it('should drop RFC1918 excepts when blockPrivateIps is false', async () => {
        mockEnvs.NANGO_OUTBOUND_URL_POLICY = { blockPrivateIps: false };

        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const egress = policyByName('allow-egress-to-nango-and-internet-1').spec.egress;
        const internetRule = egress.find((rule: { to?: { ipBlock?: { cidr: string } }[] }) => rule.to?.[0]?.ipBlock?.cidr === '0.0.0.0/0');
        expect(internetRule.to[0].ipBlock.except).not.toContain('10.0.0.0/8');
        expect(internetRule.to[0].ipBlock.except).toContain('169.254.169.254/32');
        expect(internetRule.to[0].ipBlock.except).toContain('169.254.0.0/16');
    });
});

describe('runner internal auth env', () => {
    beforeEach(() => {
        k8sMock.calls = [];
        k8sMock.errors.clear();
        k8sMock.failLink = false;
        Object.assign(mockEnvs, defaultRunnerEnvs);
        getInternalTlsEnvMock.mockReturnValue({});
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = undefined;
        mockEnvs.NANGO_INTERNAL_AUTH_TOKEN = undefined;
    });

    it('does not inject fleet tokens when the signing key is unset', async () => {
        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const deployment = k8sMock.calls.find((call) => call.method === 'createNamespacedDeployment')?.body;
        const spec = deployment.spec.template.spec;
        expect(spec.volumes).toBeUndefined();
        expect(spec.serviceAccountName).toBeUndefined();
        expect(spec.containers[0].volumeMounts).toBeUndefined();
        expect(spec.containers[0].env.find((env: { name: string }) => env.name === 'NANGO_INTERNAL_AUTH_TOKEN')).toBeUndefined();
        expect(spec.containers[0].env.find((env: { name: string }) => env.name === 'NANGO_INTERNAL_AUTH_SIGNING_KEY')).toBeUndefined();
        expect(spec.containers[0].env.find((env: { name: string }) => env.name === 'NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY')).toBeUndefined();
        expect(spec.containers[0].env.find((env: { name: string }) => env.name === 'NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN')).toBeUndefined();
    });

    it('injects a node-bound JWT when the signing key is set', async () => {
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        mockEnvs.NANGO_INTERNAL_AUTH_TOKEN = 'shared';

        const issuedAt = Math.floor(Date.now() / 1000);
        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const secret = k8sMock.calls.find((call) => call.method === 'createNamespacedSecret')?.body;
        expect(secret.metadata.name).toBe(authSecretName);
        const nodeToken = secret.stringData.NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN as string;
        expect(verifyInternalServiceToken(nodeToken, 'jobs', 'sign')).toMatchObject({
            kind: 'hmac',
            op: 'node',
            nodeId: '1',
            audience: 'jobs'
        });
        const nodeExp = JSON.parse(Buffer.from(nodeToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp: number };
        expect(nodeExp.exp).toBeGreaterThanOrEqual(issuedAt + INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS);
        expect(nodeExp.exp).toBeLessThan(issuedAt + INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS + 5);
        expect(secret.stringData).not.toHaveProperty('NANGO_INTERNAL_AUTH_TOKEN');
        expect(secret.stringData).not.toHaveProperty('NANGO_INTERNAL_AUTH_SIGNING_KEY');
        expect(secret.stringData.NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY).toBe(exportRunnerPublicKey('sign'));
        expect(secret.stringData.NANGO_INTERNAL_AUTH_REQUIRED).toBe('false');

        const deployment = k8sMock.calls.find((call) => call.method === 'createNamespacedDeployment')?.body;
        const spec = deployment.spec.template.spec;
        expect(spec.volumes).toBeUndefined();
        expect(spec.serviceAccountName).toBeUndefined();
        const nodeEnv = spec.containers[0].env.find((env: { name: string }) => env.name === 'NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN');
        expect(nodeEnv).toEqual({
            name: 'NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN',
            valueFrom: { secretKeyRef: { name: authSecretName, key: 'NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN' } }
        });
        expect(spec.containers[0].env.find((env: { name: string }) => env.name === 'NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY')).toEqual({
            name: 'NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY',
            valueFrom: { secretKeyRef: { name: authSecretName, key: 'NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY' } }
        });
        expect(spec.containers[0].env.find((env: { name: string }) => env.name === 'NANGO_INTERNAL_AUTH_SIGNING_KEY')).toBeUndefined();
        expect(spec.containers[0].env.find((env: { name: string }) => env.name === 'NANGO_INTERNAL_AUTH_REQUIRED')).toEqual({
            name: 'NANGO_INTERNAL_AUTH_REQUIRED',
            valueFrom: { secretKeyRef: { name: authSecretName, key: 'NANGO_INTERNAL_AUTH_REQUIRED' } }
        });
        expect(JSON.stringify(deployment)).not.toMatch(/eyJ/);
        expect(spec.containers[0].env.find((env: { name: string }) => env.name === 'NANGO_INTERNAL_AUTH_TOKEN')).toBeUndefined();
        expect(JSON.stringify(spec.containers[0].env)).not.toContain('sign');
    });

    it('stores fleet JWTs in a separate secret from TLS assets', async () => {
        getInternalTlsEnvMock.mockReturnValue(tlsEnv);
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';

        const res = await kubernetesNodeProvider.start(node);
        expect(res.isOk()).toBe(true);

        const secrets = k8sMock.calls.filter((call) => call.method === 'createNamespacedSecret').map((call) => call.body);
        expect(secrets.map((secret) => secret.metadata.name).sort()).toEqual([authSecretName, secretName].sort());
        const tlsSecret = secrets.find((secret) => secret.metadata.name === secretName);
        const authSecret = secrets.find((secret) => secret.metadata.name === authSecretName);
        expect(tlsSecret.stringData).toEqual(tlsEnv);
        expect(tlsSecret.stringData).not.toHaveProperty('NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN');
        expect(authSecret.stringData.NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN).toEqual(expect.stringMatching(/^eyJ/));
        expect(authSecret.stringData).not.toHaveProperty('NANGO_INTERNAL_TLS_CERT');
    });

    it('deletes the auth secret as well as TLS if auth secret create fails', async () => {
        getInternalTlsEnvMock.mockReturnValue(tlsEnv);
        mockEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        k8sMock.errors.set(`createNamespacedSecret:${authSecretName}`, { reason: 'Timeout' });

        const res = await kubernetesNodeProvider.start(node);
        expect(res.isErr()).toBe(true);
        expect(methodsCalled()).not.toContain('createNamespacedDeployment');
        expect(k8sMock.calls.filter((call) => call.method === 'deleteNamespacedSecret').map((call) => call.name)).toEqual([secretName, authSecretName]);
    });
});
