import type { Node, NodeProvider } from '@nangohq/fleet';
import { Ok, Err } from '@nangohq/utils';
import * as k8s from '@kubernetes/client-node';
import { envs } from '../env.js';
import { getPersistAPIUrl, getProvidersUrl } from '@nangohq/shared';

export const kubernetesNodeProvider: NodeProvider = {
    defaultNodeConfig: {
        cpuMilli: 500,
        memoryMb: 512,
        storageMb: 20000
    },
    start: async (node: Node) => {
        // TODO: Implement Kubernetes pod creation
        if (!envs.RUNNER_OWNER_ID) {
            throw new Error('RUNNER_OWNER_ID is not set');
        }
        const ownerId = envs.RUNNER_OWNER_ID;
        const name = serviceName(node);

        // Load Kubernetes config (works with local kubeconfig or in-cluster config)
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();
        const namespace = 'nango';
        const appsApi = kc.makeApiClient(k8s.AppsV1Api);
        const coreApi = kc.makeApiClient(k8s.CoreV1Api);
        // 1. Create Deployment
        const deploymentManifest: k8s.V1Deployment = {
            metadata: {
                name,
                labels: { app: name, ownerId }
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
                                env: [
                                    { name: 'PORT', value: '8080' },
                                    { name: 'NODE_ENV', value: envs.NODE_ENV },
                                    { name: 'NANGO_CLOUD', value: String(envs.NANGO_CLOUD) },
                                    { name: 'NODE_OPTIONS', value: `--max-old-space-size=${Math.floor((node.memoryMb / 4) * 3)}` },
                                    { name: 'RUNNER_NODE_ID', value: `${node.id}` },
                                    { name: 'RUNNER_URL', value: `http://${name}` },
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
        await appsApi.createNamespacedDeployment({
            namespace,
            body: deploymentManifest
        });
        console.log(`✅ Deployment created for routing id ${node.routingId}`);

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

        await coreApi.createNamespacedService({
            namespace,
            body: serviceManifest
        });
        console.log(`✅ Service created for routing id ${node.routingId}`);

        return Ok(undefined);
    },
    terminate: async (node: Node) => {
        // TODO: Implement Kubernetes pod deletion
        const name = serviceName(node);
        const namespace = 'nango';

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
            console.log(`✅ Deployment deleted for routing id ${node.routingId}`);

            // 2. Delete Service
            await coreApi.deleteNamespacedService({
                name,
                namespace
            });
            console.log(`✅ Service deleted for routing id ${node.routingId}`);

            return Ok(undefined);
        } catch (err) {
            console.error(`❌ Failed to terminate node ${node.routingId}:`, err);
            return Err(err as Error);
        }
    },
    verifyUrl: (url: string) => {
        console.log('verifyUrl', url);
        // Validate URL format for Kubernetes services
        // Expected format: http://{routingId}-{nodeId}
        // Example: http://account-123-456
        if (!url.match(/^http:\/\/[a-zA-Z0-9-]+-\d+$/)) {
            return Promise.resolve(Err(new Error('Invalid Kubernetes service URL format')));
        }
        return Promise.resolve(Ok(undefined));
    }
};

function serviceName(node: Node) {
    return `${node.routingId}-${node.id}`;
}
