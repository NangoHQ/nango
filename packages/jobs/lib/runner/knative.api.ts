import * as k8s from '@kubernetes/client-node';

import { Err, Ok } from '@nangohq/utils';

import { Kubernetes } from './kubernetes.api.js';

import type { Node } from '@nangohq/fleet';
import type { Result } from '@nangohq/types';

export class Knative extends Kubernetes {
    private static kninstance: Knative | null = null;
    protected readonly customObjectsApi: k8s.CustomObjectsApi;
    constructor() {
        super();
        this.customObjectsApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
    }

    static override getInstance(): Knative {
        if (!Knative.kninstance) {
            Knative.kninstance = new Knative();
        }
        return Knative.kninstance;
    }

    override async deleteNode(node: Node): Promise<Result<void>> {
        const name = this.getServiceName(node);
        const namespace = this.getNamespace(node);
        try {
            await this.customObjectsApi.deleteNamespacedCustomObject({
                group: 'serving.knative.dev',
                version: 'v1',
                namespace,
                plural: 'services',
                name
            });
        } catch (err: any) {
            if (!this.notFound(err)) {
                return Err(new Error('Failed to delete knative service', { cause: err }));
            }
        }
        try {
            await this.deleteNetworkPolicies(namespace, node.id);
        } catch (err: any) {
            return Err(new Error('Failed to delete network policies', { cause: err }));
        }
        return Ok(undefined);
    }

    override async createNode(node: Node): Promise<Result<void>> {
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
        // Create network policies
        const networkPoliciesResult = await this.createNetworkPolicies(namespace, node.id);
        if (networkPoliciesResult.isErr()) {
            return networkPoliciesResult;
        }

        const knativeServiceResult = await this.createKnativeService(node, name, namespace, runnerUrl);
        if (knativeServiceResult.isErr()) {
            return knativeServiceResult;
        }

        return Ok(undefined);
    }

    async createKnativeService(node: Node, name: string, namespace: string, runnerUrl: string): Promise<Result<void>> {
        const ksvc = {
            apiVersion: `serving.knative.dev/v1`,
            kind: 'Service',
            metadata: {
                name,
                labels: { app: name }
            },
            spec: {
                template: {
                    metadata: {
                        annotations: {
                            'autoscaling.knative.dev/minScale': '1'
                        }
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
                },
                traffic: [{ latestRevision: true, percent: 100 }]
            }
        };
        try {
            await this.customObjectsApi.createNamespacedCustomObject({
                group: 'serving.knative.dev',
                version: 'v1',
                namespace,
                plural: 'services',
                body: ksvc
            });
            return Ok(undefined);
        } catch (err: any) {
            if (this.alreadyExists(err)) {
                return Ok(undefined);
            }
            return Err(new Error('Failed to create knative service', { cause: err }));
        }
    }
}
