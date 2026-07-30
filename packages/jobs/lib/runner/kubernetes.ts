import * as k8s from '@kubernetes/client-node';

import { waitUntilHealthy } from '@nangohq/fleet';
import { getJobsUrl, getPersistAPIUrl, getProvidersUrl } from '@nangohq/shared';
import { Err, getInternalTlsEnv, getLogger, Ok } from '@nangohq/utils';

import { envs } from '../env.js';
import { notifyOnIdle } from './runner.js';

import type { Node, NodeProvider } from '@nangohq/fleet';
import type { Result } from '@nangohq/utils';

export const logger = getLogger('Kubernetes');

export function getTlsSecretName(serviceName: string): string {
    return `${serviceName}-internal-tls`;
}

/**
 * The assets go in a Secret rather than straight into the pod spec: a literal there is readable by
 * anyone who can get pods and is echoed into the audit log of every pod create.
 */
export function getTlsEnvVars(serviceName: string, tlsEnv: Record<string, string> = getInternalTlsEnv()): k8s.V1EnvVar[] {
    return Object.keys(tlsEnv).map((key) => ({
        name: key,
        valueFrom: { secretKeyRef: { name: getTlsSecretName(serviceName), key } }
    }));
}

class Kubernetes {
    private static instance: Kubernetes | null = null;
    private readonly kc: k8s.KubeConfig;
    private readonly appsApi: k8s.AppsV1Api;
    private readonly coreApi: k8s.CoreV1Api;
    private readonly networkingApi: k8s.NetworkingV1Api;
    private readonly defaultNamespace: string;
    private readonly namespacePerRunner: boolean;
    private readonly jobsNamespace: string;

    private constructor() {
        this.defaultNamespace = envs.RUNNER_NAMESPACE;
        this.namespacePerRunner = envs.NAMESPACE_PER_RUNNER || false;
        this.jobsNamespace = envs.JOBS_NAMESPACE;

        this.kc = new k8s.KubeConfig();
        this.kc.loadFromDefault();
        this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
        this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
        this.networkingApi = this.kc.makeApiClient(k8s.NetworkingV1Api);
    }

    alreadyExists(err: any): boolean {
        if (err.body) {
            const body = JSON.parse(err.body);
            return body.reason == 'AlreadyExists';
        }
        return false;
    }

    notFound(err: any): boolean {
        if (err.body) {
            const body = JSON.parse(err.body);
            return body.reason == 'NotFound';
        }
        return false;
    }

    static getInstance(): Kubernetes {
        if (!Kubernetes.instance) {
            Kubernetes.instance = new Kubernetes();
        }
        return Kubernetes.instance;
    }

    async createNode(node: Node): Promise<Result<void>> {
        const name = this.getServiceName(node);
        const namespace = this.getNamespace(node);
        const runnerUrl = this.getRunnerUrl(node);

        // Ensure namespace exists if using per-runner namespaces
        if (this.namespacePerRunner) {
            const namespaceResult = await this.ensureNamespace(namespace);
            if (namespaceResult.isErr()) {
                return namespaceResult;
            }
        }

        // Create the TLS secret first, otherwise the pods cannot start
        const tlsSecretResult = await this.createTlsSecret(name, namespace);
        if (tlsSecretResult.isErr()) {
            return tlsSecretResult;
        }

        // Create deployment
        const deploymentResult = await this.createDeployment(node, name, namespace, runnerUrl);
        if (deploymentResult.isErr()) {
            return deploymentResult;
        }

        // Create service
        const serviceResult = await this.createService(node, name, namespace);
        if (serviceResult.isErr()) {
            return serviceResult;
        }

        // Create network policies
        const networkPoliciesResult = await this.createNetworkPolicies(namespace, node.id);
        if (networkPoliciesResult.isErr()) {
            return networkPoliciesResult;
        }

        return Ok(undefined);
    }

    async deleteNode(node: Node): Promise<Result<void>> {
        const name = this.getServiceName(node);
        const namespace = this.getNamespace(node);

        try {
            try {
                await this.appsApi.deleteNamespacedDeployment({
                    name,
                    namespace
                });
            } catch (err: any) {
                if (!this.notFound(err)) {
                    return Err(new Error('Failed to delete deployment', { cause: err }));
                }
            }

            try {
                await this.coreApi.deleteNamespacedService({
                    name,
                    namespace
                });
            } catch (err: any) {
                if (!this.notFound(err)) {
                    return Err(new Error('Failed to delete service', { cause: err }));
                }
            }

            try {
                await this.deleteNetworkPolicies(namespace, node.id);
            } catch (err: any) {
                return Err(new Error('Failed to delete network policies', { cause: err }));
            }

            try {
                await this.coreApi.deleteNamespacedSecret({
                    name: getTlsSecretName(name),
                    namespace
                });
            } catch (err: any) {
                if (!this.notFound(err)) {
                    return Err(new Error('Failed to delete internal TLS secret', { cause: err }));
                }
            }

            return Ok(undefined);
        } catch (err) {
            return Err(err as Error);
        }
    }

    verifyUrl(url: string): Promise<Result<void>> {
        // Match both patterns:
        // - http://service-name (without namespace)
        // - http://service-name.namespace (with namespace)
        if (!url.match(new RegExp(`^${envs.NANGO_RUNNER_URL_SCHEME}://[a-zA-Z0-9-]+(\\.[a-zA-Z0-9-]+)?$`))) {
            return Promise.resolve(Err(new Error('Invalid Kubernetes service URL format')));
        }
        return Promise.resolve(Ok(undefined));
    }

    private async ensureNamespace(namespace: string): Promise<Result<void>> {
        const namespaceManifest: k8s.V1Namespace = {
            metadata: {
                name: namespace
            }
        };

        try {
            await this.coreApi.createNamespace({
                body: namespaceManifest
            });
        } catch (err: any) {
            if (this.alreadyExists(err)) {
                return Ok(undefined);
            }
            return Err(new Error('Failed to create namespace', { cause: err }));
        }

        return Ok(undefined);
    }

    private async createTlsSecret(name: string, namespace: string): Promise<Result<void>> {
        const tlsEnv = getInternalTlsEnv();
        if (Object.keys(tlsEnv).length === 0) {
            return Ok(undefined);
        }

        const secretManifest: k8s.V1Secret = {
            metadata: {
                name: getTlsSecretName(name),
                labels: { app: name }
            },
            type: 'Opaque',
            stringData: tlsEnv
        };

        try {
            await this.coreApi.createNamespacedSecret({
                namespace,
                body: secretManifest
            });
            return Ok(undefined);
        } catch (err: any) {
            if (!this.alreadyExists(err)) {
                return Err(new Error('Failed to create internal TLS secret', { cause: err }));
            }
        }

        // Left over from an earlier attempt at this same node. Overwrite rather than adopt it, so a
        // retry cannot hand the runner assets this service no longer holds. Replace is a PUT and
        // needs the current resourceVersion for optimistic concurrency.
        try {
            const existing = await this.coreApi.readNamespacedSecret({
                name: getTlsSecretName(name),
                namespace
            });
            await this.coreApi.replaceNamespacedSecret({
                name: getTlsSecretName(name),
                namespace,
                body: {
                    ...secretManifest,
                    metadata: {
                        ...secretManifest.metadata,
                        resourceVersion: existing.metadata?.resourceVersion
                    }
                }
            });
        } catch (err: any) {
            return Err(new Error('Failed to update internal TLS secret', { cause: err }));
        }
        return Ok(undefined);
    }

    private async createDeployment(node: Node, name: string, namespace: string, runnerUrl: string): Promise<Result<void>> {
        let noDisruptSpec = {};
        if (envs.RUNNER_DO_NOT_DISRUPT) {
            noDisruptSpec = {
                nodeSelector: {
                    'nango.dev/lifecycle': 'no-disrupt'
                },
                tolerations: [
                    {
                        key: 'nango.dev/lifecycle',
                        operator: 'Equal',
                        value: 'no-disrupt',
                        effect: 'NoSchedule'
                    }
                ]
            };
        }
        const deploymentManifest: k8s.V1Deployment = {
            metadata: {
                name,
                labels: { app: name }
            },
            spec: {
                replicas: node.replicas,
                selector: { matchLabels: { app: name } },
                template: {
                    metadata: {
                        annotations: {
                            [`ad.datadoghq.com/runner.logs`]: `[{"source":"nango","service":"${name}"}]`,
                            ['karpenter.sh/do-not-disrupt']: `${envs.RUNNER_DO_NOT_DISRUPT}`
                        },
                        labels: { app: name }
                    },
                    spec: {
                        ...noDisruptSpec,
                        containers: [
                            {
                                name: 'runner',
                                image: node.image,
                                ports: [{ containerPort: 8080 }],
                                args: ['node', 'packages/runner/dist/app.js', '8080', 'dockerized-runner'],
                                resources: this.getResourceLimits(node),
                                env: this.getEnvironmentVariables(node, name, runnerUrl)
                            }
                        ]
                    }
                }
            }
        };
        if (node.isProfilingEnabled || node.isTracingEnabled) {
            deploymentManifest.spec!.template.metadata!.labels!['nango.dev/apm'] = 'enabled';
        }

        try {
            await this.appsApi.createNamespacedDeployment({
                namespace,
                body: deploymentManifest
            });
            return Ok(undefined);
        } catch (err: any) {
            if (this.alreadyExists(err)) {
                return Ok(undefined);
            }
            return Err(new Error('Failed to create deployment', { cause: err }));
        }
    }

    private async createService(_node: Node, name: string, namespace: string): Promise<Result<void>> {
        const serviceManifest: k8s.V1Service = {
            metadata: {
                name,
                labels: { app: name }
            },
            spec: {
                selector: { app: name },
                ports: [
                    {
                        protocol: 'TCP',
                        port: 80,
                        targetPort: 8080
                    }
                ],
                type: 'ClusterIP'
            }
        };

        try {
            await this.coreApi.createNamespacedService({
                namespace,
                body: serviceManifest
            });
        } catch (err: any) {
            if (this.alreadyExists(err)) {
                return Ok(undefined);
            }
            return Err(new Error('Failed to create service', { cause: err }));
        }
        return Ok(undefined);
    }

    private async createNetworkPolicies(namespace: string, nodeId: number): Promise<Result<void>> {
        const denyAll: k8s.V1NetworkPolicy = {
            metadata: { name: `default-deny-${nodeId}` },
            spec: {
                podSelector: {},
                policyTypes: ['Ingress']
            }
        };
        try {
            await this.networkingApi.createNamespacedNetworkPolicy({
                namespace,
                body: denyAll
            });
        } catch (err: any) {
            if (this.alreadyExists(err)) {
                return Ok(undefined);
            }
            return Err(new Error('Failed to create default-deny network policy', { cause: err }));
        }
        const allowFromNango: k8s.V1NetworkPolicy = {
            metadata: { name: `allow-from-nango-${nodeId}` },
            spec: {
                podSelector: {},
                ingress: [
                    {
                        _from: [
                            {
                                namespaceSelector: {
                                    matchLabels: { name: this.jobsNamespace }
                                }
                            }
                        ]
                    }
                ],
                policyTypes: ['Ingress']
            }
        };
        try {
            await this.networkingApi.createNamespacedNetworkPolicy({
                namespace,
                body: allowFromNango
            });
        } catch (err: any) {
            if (this.alreadyExists(err)) {
                return Ok(undefined);
            }
            return Err(new Error('Failed to create allow-from-nango network policy', { cause: err }));
        }

        const allowEgressToNangoAndInternet: k8s.V1NetworkPolicy = {
            metadata: { name: `allow-egress-to-nango-and-internet-${nodeId}` },
            spec: {
                podSelector: {},
                policyTypes: ['Egress'],
                egress: [
                    {
                        to: [
                            {
                                namespaceSelector: {
                                    matchLabels: { name: this.jobsNamespace }
                                }
                            }
                        ]
                    },
                    {
                        to: [
                            {
                                ipBlock: {
                                    cidr: '0.0.0.0/0'
                                }
                            }
                        ]
                    }
                ]
            }
        };
        try {
            await this.networkingApi.createNamespacedNetworkPolicy({
                namespace,
                body: allowEgressToNangoAndInternet
            });
        } catch (err: any) {
            if (this.alreadyExists(err)) {
                return Ok(undefined);
            }
            return Err(new Error('Failed to create allow-egress-to-nango-and-internet network policy', { cause: err }));
        }

        return Ok(undefined);
    }

    private async deleteNetworkPolicies(namespace: string, nodeId: number): Promise<void> {
        try {
            await this.networkingApi.deleteNamespacedNetworkPolicy({
                name: `default-deny-${nodeId}`,
                namespace
            });
        } catch (err: any) {
            if (!this.notFound(err)) {
                throw err;
            }
        }
        try {
            await this.networkingApi.deleteNamespacedNetworkPolicy({
                name: `allow-from-nango-${nodeId}`,
                namespace
            });
        } catch (err: any) {
            if (!this.notFound(err)) {
                throw err;
            }
        }
        try {
            await this.networkingApi.deleteNamespacedNetworkPolicy({
                name: `allow-egress-to-nango-and-internet-${nodeId}`,
                namespace
            });
        } catch (err: any) {
            if (!this.notFound(err)) {
                throw err;
            }
        }
    }

    private getServiceName(node: Node): string {
        return `${node.routingId}-${node.id}`;
    }

    private getNamespace(node: Node): string {
        if (this.namespacePerRunner) {
            return `${this.defaultNamespace}-${node.routingId}`;
        }
        return this.defaultNamespace;
    }

    private getRunnerUrl(node: Node): string {
        const name = this.getServiceName(node);
        const scheme = envs.NANGO_RUNNER_URL_SCHEME;
        if (this.namespacePerRunner) {
            const namespace = this.getNamespace(node);
            return `${scheme}://${name}.${namespace}`;
        }
        return `${scheme}://${name}`;
    }

    private getEnvironmentVariables(node: Node, name: string, runnerUrl: string): k8s.V1EnvVar[] {
        return [
            { name: 'PORT', value: '8080' },
            { name: 'NODE_ENV', value: envs.NODE_ENV },
            { name: 'NANGO_CLOUD', value: String(envs.NANGO_CLOUD) },
            { name: 'NODE_OPTIONS', value: `--max-old-space-size=${Math.floor((node.memoryMb / 4) * 3)}` },
            { name: 'RUNNER_NODE_ID', value: `${node.id}` },
            { name: 'RUNNER_URL', value: runnerUrl },
            { name: 'IDLE_MAX_DURATION_MS', value: `${node.idleMaxDurationMs}` },
            { name: 'PERSIST_SERVICE_URL', value: getPersistAPIUrl() },
            { name: 'NANGO_TELEMETRY_SDK', value: process.env['NANGO_TELEMETRY_SDK'] || 'false' },
            { name: 'NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED', value: String(envs.NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED) },
            ...(envs.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST.length > 0
                ? [{ name: 'NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST', value: JSON.stringify(envs.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST) }]
                : []),
            ...(envs.NANGO_OUTBOUND_URL_POLICY ? [{ name: 'NANGO_OUTBOUND_URL_POLICY', value: JSON.stringify(envs.NANGO_OUTBOUND_URL_POLICY) }] : []),
            ...(envs.DD_ENV ? [{ name: 'DD_ENV', value: envs.DD_ENV }] : []),
            ...(envs.DD_SITE ? [{ name: 'DD_SITE', value: envs.DD_SITE }] : []),
            ...(envs.DD_TRACE_AGENT_URL ? [{ name: 'DD_TRACE_AGENT_URL', value: envs.DD_TRACE_AGENT_URL }] : []),
            { name: 'DD_PROFILING_ENABLED', value: String(node.isProfilingEnabled) },
            { name: 'DD_APM_TRACING_ENABLED', value: String(node.isTracingEnabled) },
            { name: 'DD_TRACE_ENABLED', value: String(node.isTracingEnabled || node.isProfilingEnabled) },
            { name: 'JOBS_SERVICE_URL', value: getJobsUrl() },
            { name: 'PROVIDERS_URL', value: getProvidersUrl() },
            { name: 'PROVIDERS_RELOAD_INTERVAL', value: envs.PROVIDERS_RELOAD_INTERVAL.toString() },
            ...(node.replicas > 1 ? [{ name: 'RUNNER_CONFLICT_RESOLUTION_MODE', value: 'DISTRIBUTED' }] : []),
            ...getTlsEnvVars(name)
        ];
    }

    private MAX_REQUEST_CPU = envs.RUNNER_MAX_REQUEST_CPU;
    private MAX_REQUEST_MEMORY = envs.RUNNER_MAX_REQUEST_MEMORY;
    private MIN_REQUEST_CPU = envs.RUNNER_MIN_REQUEST_CPU;
    private MIN_REQUEST_MEMORY = envs.RUNNER_MIN_REQUEST_MEMORY;
    private REQUEST_CPU_MULTIPLIER = envs.RUNNER_REQUEST_CPU_MULTIPLIER;
    private REQUEST_MEMORY_MULTIPLIER = envs.RUNNER_REQUEST_MEMORY_MULTIPLIER;

    private getResourceLimits(node: Node): { requests: { cpu: string; memory: string }; limits: { cpu: string; memory: string } } {
        const requestCpu = Math.max(this.MIN_REQUEST_CPU, Math.min(this.MAX_REQUEST_CPU, node.cpuMilli));
        const requestMemory = Math.max(this.MIN_REQUEST_MEMORY, Math.min(this.MAX_REQUEST_MEMORY, node.memoryMb));
        const limitCpu = Math.max(requestCpu, Math.min(this.MAX_REQUEST_CPU, Math.floor(node.cpuMilli * this.REQUEST_CPU_MULTIPLIER)));
        const limitMemory = Math.max(requestMemory, Math.min(this.MAX_REQUEST_MEMORY, Math.floor(node.memoryMb * this.REQUEST_MEMORY_MULTIPLIER)));
        return {
            requests: {
                cpu: `${requestCpu}m`,
                memory: `${requestMemory}Mi`
            },
            limits: {
                cpu: `${limitCpu}m`,
                memory: `${limitMemory}Mi`
            }
        };
    }
}

export const kubernetesNodeProvider: NodeProvider = {
    defaultNodeConfig: {
        cpuMilli: 500,
        memoryMb: 512,
        storageMb: 20000,
        isTracingEnabled: false,
        isProfilingEnabled: false,
        idleMaxDurationMs: 1_800_000,
        executionTimeoutSecs: -1,
        provisionedConcurrency: -1,
        replicas: 1
    },
    start: async (node: Node) => {
        const kubernetes = Kubernetes.getInstance();
        return kubernetes.createNode(node);
    },
    terminate: async (node: Node) => {
        const kubernetes = Kubernetes.getInstance();
        return kubernetes.deleteNode(node);
    },
    verifyUrl: (url: string) => {
        const kubernetes = Kubernetes.getInstance();
        return kubernetes.verifyUrl(url);
    },
    finish: async (node: Node) => {
        return notifyOnIdle(node);
    },
    waitUntilHealthy: async (opts: { nodeId: number; url: string; timeoutMs: number }) => {
        return waitUntilHealthy({ url: `${opts.url}/health`, timeoutMs: opts.timeoutMs });
    }
};
