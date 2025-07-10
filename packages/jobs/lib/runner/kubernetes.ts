import * as k8s from '@kubernetes/client-node';

import { getPersistAPIUrl, getProvidersUrl } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { envs } from '../env.js';

import type { Node, NodeProvider } from '@nangohq/fleet';

// Load Kubernetes config (works with local kubeconfig or in-cluster config)
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const defaultNamespace = envs.RUNNER_NAMESPACE;
const namespacePerRunner = envs.NAMESPACE_PER_RUNNER || false;
const appsApi = kc.makeApiClient(k8s.AppsV1Api);
const coreApi = kc.makeApiClient(k8s.CoreV1Api);

export const kubernetesNodeProvider: NodeProvider = {
    defaultNodeConfig: {
        cpuMilli: 500,
        memoryMb: 512,
        storageMb: 20000
    },
    start: async (node: Node) => {
        const name = serviceName(node);
        let namespace = defaultNamespace;
        let runnerUrl = `http://${name}`;

        if (namespacePerRunner) {
            namespace = `${defaultNamespace}-${node.routingId}`;
            runnerUrl = `http://${name}.${namespace}`;
            const namespaceManifest: k8s.V1Namespace = {
                metadata: {
                    name: namespace
                }
            };
            try {
                await coreApi.createNamespace({
                    body: namespaceManifest
                });
            } catch (err: any) {
                if (err.body?.reason !== 'AlreadyExists') {
                    return Err(new Error('Failed to create namespace', { cause: err }));
                }
            }
        }

        const deploymentManifest: k8s.V1Deployment = {
            metadata: {
                name,
                labels: { app: name }
            },
            spec: {
                replicas: 1,
                selector: { matchLabels: { app: name } },
                template: {
                    metadata: { labels: { app: name } },
                    spec: {
                        containers: [
                            {
                                name: 'runner',
                                image: node.image,
                                ports: [{ containerPort: 8080 }],
                                args: ['node', 'packages/runner/dist/app.js', '8080', 'dockerized-runner'],
                                resources: getResourceLimits(node),
                                env: [
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
                                    { name: 'JOBS_SERVICE_URL', value: envs.JOBS_SERVICE_URL },
                                    { name: 'PROVIDERS_URL', value: getProvidersUrl() },
                                    { name: 'PROVIDERS_RELOAD_INTERVAL', value: envs.PROVIDERS_RELOAD_INTERVAL.toString() }
                                ]
                            }
                        ]
                    }
                }
            }
        };
        try {
            await appsApi.createNamespacedDeployment({
                namespace,
                body: deploymentManifest
            });
        } catch (err) {
            return Err(new Error('Failed to create deployment', { cause: err }));
        }

        // 2. Create Service
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
                type: 'ClusterIP' // Change to LoadBalancer or NodePort if needed
            }
        };
        try {
            await coreApi.createNamespacedService({
                namespace,
                body: serviceManifest
            });
        } catch (err) {
            return Err(new Error('Failed to create service', { cause: err }));
        }

        return Ok(undefined);
    },
    terminate: async (node: Node) => {
        const name = serviceName(node);
        const namespace = envs.RUNNER_NAMESPACE;

        // Load Kubernetes config
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();
        const appsApi = kc.makeApiClient(k8s.AppsV1Api);
        const coreApi = kc.makeApiClient(k8s.CoreV1Api);

        try {
            // 1. Delete Deployment
            await appsApi.deleteNamespacedDeployment({
                name,
                namespace
            });

            // 2. Delete Service
            await coreApi.deleteNamespacedService({
                name,
                namespace
            });

            return Ok(undefined);
        } catch (err) {
            return Err(err as Error);
        }
    },
    verifyUrl: (url: string) => {
        // Match both patterns:
        // - http://service-name (without namespace)
        // - http://service-name.namespace (with namespace)
        if (!url.match(/^http:\/\/[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)?$/)) {
            return Promise.resolve(Err(new Error('Invalid Kubernetes service URL format')));
        }
        return Promise.resolve(Ok(undefined));
    }
};

function getResourceLimits(node: Node): { requests: { cpu: string; memory: string }; limits: { cpu: string; memory: string } } {
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
                memory: '10424Mi'
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
            memory: '1023Mi'
        },
        limits: {
            cpu: '500m',
            memory: '1024Mi'
        }
    };
}

function serviceName(node: Node) {
    return `${node.routingId}-${node.id}`;
}
