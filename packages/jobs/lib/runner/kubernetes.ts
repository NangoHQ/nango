import * as k8s from '@kubernetes/client-node';

import { getJobsUrl, getPersistAPIUrl, getProvidersUrl } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import { envs } from '../env.js';

import type { Node, NodeProvider } from '@nangohq/fleet';
import type { Result } from '@nangohq/utils';

export const logger = getLogger('Kubernetes');

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

            return Ok(undefined);
        } catch (err) {
            return Err(err as Error);
        }
    }

    verifyUrl(url: string): Promise<Result<void>> {
        // Match both patterns:
        // - http://service-name (without namespace)
        // - http://service-name.namespace (with namespace)
        if (!url.match(/^http:\/\/[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)?$/)) {
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

    private async createDeployment(node: Node, name: string, namespace: string, runnerUrl: string): Promise<Result<void>> {
        const deploymentManifest: k8s.V1Deployment = {
            metadata: {
                name,
                labels: { app: name }
            },
            spec: {
                replicas: 1,
                selector: { matchLabels: { app: name } },
                template: {
                    metadata: {
                        annotations: {
                            'ad.datadoghq.com/orchestrator.logs': `[{"source":"nango","service":"${name}"}]`
                        },
                        labels: { app: name }
                    },
                    spec: {
                        containers: [
                            {
                                name: 'runner',
                                image: node.image,
                                ports: [{ containerPort: 8080 }],
                                args: ['node', 'packages/runner/dist/app.js', '8080', 'dockerized-runner'],
                                resources: this.getResourceLimits(node),
                                env: this.getEnvironmentVariables(node, runnerUrl)
                            }
                        ]
                    }
                }
            }
        };

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
        if (this.namespacePerRunner) {
            const namespace = this.getNamespace(node);
            return `http://${name}.${namespace}`;
        }
        return `http://${name}`;
    }

    private getEnvironmentVariables(node: Node, runnerUrl: string): k8s.V1EnvVar[] {
        return [
            { name: 'PORT', value: '8080' },
            { name: 'NODE_ENV', value: envs.NODE_ENV },
            { name: 'NANGO_CLOUD', value: String(envs.NANGO_CLOUD) },
            { name: 'NODE_OPTIONS', value: `--max-old-space-size=${Math.floor((node.memoryMb / 4) * 3)}` },
            { name: 'RUNNER_NODE_ID', value: `${node.id}` },
            { name: 'RUNNER_URL', value: runnerUrl },
            { name: 'IDLE_MAX_DURATION_MS', value: `${25 * 60 * 60 * 1000}` }, // 25 hours
            { name: 'PERSIST_SERVICE_URL', value: getPersistAPIUrl() },
            { name: 'NANGO_TELEMETRY_SDK', value: process.env['NANGO_TELEMETRY_SDK'] || 'false' },
            ...(envs.DD_ENV ? [{ name: 'DD_ENV', value: envs.DD_ENV }] : []),
            ...(envs.DD_SITE ? [{ name: 'DD_SITE', value: envs.DD_SITE }] : []),
            ...(envs.DD_TRACE_AGENT_URL ? [{ name: 'DD_TRACE_AGENT_URL', value: envs.DD_TRACE_AGENT_URL }] : []),
            { name: 'JOBS_SERVICE_URL', value: getJobsUrl() },
            { name: 'PROVIDERS_URL', value: getProvidersUrl() },
            { name: 'PROVIDERS_RELOAD_INTERVAL', value: envs.PROVIDERS_RELOAD_INTERVAL.toString() }
        ];
    }

    private getResourceLimits(node: Node): { requests: { cpu: string; memory: string }; limits: { cpu: string; memory: string } } {
        if (node.cpuMilli >= 8000 && node.memoryMb >= 32000) {
            return {
                requests: {
                    cpu: '4000m',
                    memory: '16384Mi'
                },
                limits: {
                    cpu: '8000m',
                    memory: '32768Mi'
                }
            };
        }
        if (node.cpuMilli >= 4000 && node.memoryMb >= 16000) {
            return {
                requests: {
                    cpu: '4000m',
                    memory: '8192Mi'
                },
                limits: {
                    cpu: '4000m',
                    memory: '16384Mi'
                }
            };
        }
        if (node.cpuMilli >= 4000 && node.memoryMb >= 8000) {
            return {
                requests: {
                    cpu: '2000m',
                    memory: '4096Mi'
                },
                limits: {
                    cpu: '4000m',
                    memory: '8192Mi'
                }
            };
        }
        if (node.cpuMilli > 2000 || node.memoryMb >= 4000) {
            return {
                requests: {
                    cpu: '1000m',
                    memory: '2048Mi'
                },
                limits: {
                    cpu: '2000m',
                    memory: '4096Mi'
                }
            };
        }
        if (node.cpuMilli > 1000 || node.memoryMb >= 2000) {
            return {
                requests: {
                    cpu: '500m',
                    memory: '1024Mi'
                },
                limits: {
                    cpu: '1000m',
                    memory: '2048Mi'
                }
            };
        }
        return {
            requests: {
                cpu: '500m',
                memory: '512Mi'
            },
            limits: {
                cpu: '500m',
                memory: '1024Mi'
            }
        };
    }
}

export const kubernetesNodeProvider: NodeProvider = {
    defaultNodeConfig: {
        cpuMilli: 500,
        memoryMb: 512,
        storageMb: 20000
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
    }
};
