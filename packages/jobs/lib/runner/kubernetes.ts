import * as k8s from '@kubernetes/client-node';

import { ipv4ExceptCidrsForNetworkPolicy, resolvePolicyForRunnerSync } from '@nangohq/egress';
import { waitUntilHealthy } from '@nangohq/fleet';
import { getJobsUrl, getPersistAPIUrl, getProvidersUrl } from '@nangohq/shared';
import {
    Err,
    getInternalTlsEnv,
    getLogger,
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    Ok,
    RUNNER_INTERNAL_AUTH_TOKEN_FILENAME,
    RUNNER_INTERNAL_AUTH_TOKEN_MOUNT_PATH
} from '@nangohq/utils';

import { envs } from '../env.js';
import { notifyOnIdle } from './runner.js';

import type { Node, NodeProvider } from '@nangohq/fleet';
import type { Result } from '@nangohq/utils';

export const logger = getLogger('Kubernetes');

function toV1LabelSelector(selector: {
    matchLabels?: Record<string, string> | undefined;
    matchExpressions?:
        | {
              key: string;
              operator: string;
              values?: string[] | undefined;
          }[]
        | undefined;
}): k8s.V1LabelSelector {
    const out: k8s.V1LabelSelector = {};
    if (selector.matchLabels) {
        out.matchLabels = selector.matchLabels;
    }
    if (selector.matchExpressions) {
        out.matchExpressions = selector.matchExpressions.map((expr) => {
            const requirement: k8s.V1LabelSelectorRequirement = { key: expr.key, operator: expr.operator };
            if (expr.values) {
                requirement.values = expr.values;
            }
            return requirement;
        });
    }
    return out;
}

export function getTlsSecretName(serviceName: string): string {
    return `${serviceName}-internal-tls`;
}

/**
 * Projected ServiceAccount token for runner register/idle. Gated so a default deploy does not
 * mount a volume that would fail pod creates until Helm creates the ServiceAccount.
 */
export function getRunnerInternalAuthPodSpec(serviceAccount: string | undefined):
    | {
          serviceAccountName: string;
          automountServiceAccountToken: false;
          volumes: k8s.V1Volume[];
          volumeMount: k8s.V1VolumeMount;
          tokenFileEnv: k8s.V1EnvVar;
      }
    | undefined {
    const name = serviceAccount?.trim();
    if (!name) {
        return undefined;
    }
    return {
        serviceAccountName: name,
        automountServiceAccountToken: false,
        volumes: [
            {
                name: 'nango-internal-auth',
                projected: {
                    sources: [
                        {
                            serviceAccountToken: {
                                audience: INTERNAL_SERVICE_AUDIENCE_JOBS,
                                expirationSeconds: 3600,
                                path: RUNNER_INTERNAL_AUTH_TOKEN_FILENAME
                            }
                        }
                    ]
                }
            }
        ],
        volumeMount: {
            name: 'nango-internal-auth',
            mountPath: RUNNER_INTERNAL_AUTH_TOKEN_MOUNT_PATH,
            readOnly: true
        },
        tokenFileEnv: {
            name: 'NANGO_INTERNAL_AUTH_TOKEN_FILE',
            value: `${RUNNER_INTERNAL_AUTH_TOKEN_MOUNT_PATH}/${RUNNER_INTERNAL_AUTH_TOKEN_FILENAME}`
        }
    };
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

/** Create failed and a follow-up read confirmed the Deployment is gone — Secret cleanup is safe. */
class DeploymentAbsentError extends Error {
    override name = 'DeploymentAbsentError';
    constructor(cause: unknown) {
        super('Failed to create deployment', { cause });
    }
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

    forbidden(err: any): boolean {
        if (err.body) {
            const body = JSON.parse(err.body);
            return body.reason == 'Forbidden';
        }
        return false;
    }

    /** Label on the jobs namespace. Ingress and egress must use the same key or one side will not match. */
    private jobsNamespaceMatchLabels(): { name: string } {
        return { name: this.jobsNamespace };
    }

    /** Same `app` label as the runner Deployment / Service — do not use `{}` (whole namespace). */
    private runnerPodSelector(name: string): k8s.V1LabelSelector {
        return { matchLabels: { app: name } };
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
            // Only delete the Secret when a read confirmed the Deployment is gone. A transient read
            // failure after an ambiguous create must leave the Secret — the Deployment may still be
            // alive and referencing it.
            if (deploymentResult.error instanceof DeploymentAbsentError) {
                await this.deleteTlsSecret(name, namespace);
            }
            return Err(deploymentResult.error);
        }

        const linkResult = await this.linkTlsSecretToDeployment(name, namespace, deploymentResult.value);
        if (linkResult.isErr()) {
            // Roll back both: without an ownerReference the Secret would leak if the Deployment is
            // later deleted outside terminate(), and a Deployment without a resolvable secretKeyRef
            // cannot run.
            await this.deleteTlsSecret(name, namespace);
            await this.deleteDeployment(name, namespace);
            return linkResult;
        }

        // Create service
        const serviceResult = await this.createService(node, name, namespace);
        if (serviceResult.isErr()) {
            return serviceResult;
        }

        // Create network policies
        const networkPoliciesResult = await this.createNetworkPolicies(namespace, node.id, name);
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

            const secretResult = await this.deleteTlsSecret(name, namespace);
            if (secretResult.isErr()) {
                return secretResult;
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
            if (!this.alreadyExists(err)) {
                return Err(new Error('Failed to create namespace', { cause: err }));
            }
        }

        const runnerServiceAccount = envs.NANGO_INTERNAL_AUTH_RUNNER_SERVICE_ACCOUNT?.trim();
        if (runnerServiceAccount) {
            const saResult = await this.ensureRunnerServiceAccount(namespace, runnerServiceAccount);
            if (saResult.isErr()) {
                return saResult;
            }
        }

        return Ok(undefined);
    }

    /**
     * Create the runner ServiceAccount in a per-runner namespace, or adopt one Helm already made.
     * Kubernetes authorizes `create` before it would return AlreadyExists, so a least-privilege
     * jobs Role that omits `create serviceaccounts` gets 403 even when the account exists.
     */
    private async ensureRunnerServiceAccount(namespace: string, name: string): Promise<Result<void>> {
        try {
            await this.coreApi.createNamespacedServiceAccount({
                namespace,
                body: {
                    metadata: { name }
                }
            });
            return Ok(undefined);
        } catch (err: any) {
            if (this.alreadyExists(err)) {
                return Ok(undefined);
            }

            try {
                await this.coreApi.readNamespacedServiceAccount({ name, namespace });
                return Ok(undefined);
            } catch (readErr: any) {
                if (this.forbidden(err) && this.forbidden(readErr)) {
                    // Create and get are both Forbidden. Kubernetes authorizes create before
                    // AlreadyExists, so Helm may already have provisioned nango-runner.
                    return Ok(undefined);
                }
                return Err(new Error('Failed to create runner service account', { cause: err }));
            }
        }
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
            const resourceVersion = existing.metadata?.resourceVersion;
            if (!resourceVersion) {
                return Err(new Error('Failed to update internal TLS secret: existing secret has no resourceVersion'));
            }
            await this.coreApi.replaceNamespacedSecret({
                name: getTlsSecretName(name),
                namespace,
                body: {
                    ...secretManifest,
                    metadata: {
                        ...secretManifest.metadata,
                        resourceVersion
                    }
                }
            });
        } catch (err: any) {
            return Err(new Error('Failed to update internal TLS secret', { cause: err }));
        }
        return Ok(undefined);
    }

    /**
     * Point the Secret at the Deployment so cluster GC removes the private key if the Deployment is
     * deleted outside terminate() (kubectl, Helm, etc.).
     */
    private async linkTlsSecretToDeployment(name: string, namespace: string, deployment: k8s.V1Deployment): Promise<Result<void>> {
        if (Object.keys(getInternalTlsEnv()).length === 0) {
            return Ok(undefined);
        }

        const uid = deployment.metadata?.uid;
        if (!uid) {
            return Err(new Error('Failed to link internal TLS secret: deployment has no uid'));
        }

        try {
            const existing = await this.coreApi.readNamespacedSecret({
                name: getTlsSecretName(name),
                namespace
            });
            const resourceVersion = existing.metadata?.resourceVersion;
            if (!resourceVersion) {
                return Err(new Error('Failed to link internal TLS secret: secret has no resourceVersion'));
            }

            await this.coreApi.replaceNamespacedSecret({
                name: getTlsSecretName(name),
                namespace,
                body: {
                    apiVersion: 'v1',
                    kind: 'Secret',
                    metadata: {
                        name: getTlsSecretName(name),
                        ...(existing.metadata?.labels ? { labels: existing.metadata.labels } : {}),
                        resourceVersion,
                        ownerReferences: [
                            {
                                apiVersion: deployment.apiVersion || 'apps/v1',
                                kind: deployment.kind || 'Deployment',
                                name,
                                uid,
                                controller: false,
                                blockOwnerDeletion: true
                            }
                        ]
                    },
                    ...(existing.type ? { type: existing.type } : {}),
                    ...(existing.data ? { data: existing.data } : {})
                }
            });
        } catch (err: any) {
            return Err(new Error('Failed to link internal TLS secret to deployment', { cause: err }));
        }
        return Ok(undefined);
    }

    private async deleteTlsSecret(name: string, namespace: string): Promise<Result<void>> {
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
    }

    private async deleteDeployment(name: string, namespace: string): Promise<Result<void>> {
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
        return Ok(undefined);
    }

    private async createDeployment(node: Node, name: string, namespace: string, runnerUrl: string): Promise<Result<k8s.V1Deployment>> {
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
        const internalAuth = getRunnerInternalAuthPodSpec(envs.NANGO_INTERNAL_AUTH_RUNNER_SERVICE_ACCOUNT);
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
                        ...(internalAuth
                            ? {
                                  serviceAccountName: internalAuth.serviceAccountName,
                                  automountServiceAccountToken: false,
                                  volumes: internalAuth.volumes
                              }
                            : {}),
                        containers: [
                            {
                                name: 'runner',
                                image: node.image,
                                ports: [{ containerPort: 8080 }],
                                args: ['node', 'packages/runner/dist/app.js', '8080', 'dockerized-runner'],
                                resources: this.getResourceLimits(node),
                                env: [...this.getEnvironmentVariables(node, name, runnerUrl), ...(internalAuth ? [internalAuth.tokenFileEnv] : [])],
                                ...(internalAuth ? { volumeMounts: [internalAuth.volumeMount] } : {})
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
            const created = await this.appsApi.createNamespacedDeployment({
                namespace,
                body: deploymentManifest
            });
            return Ok(created);
        } catch (createErr: any) {
            // Create may have succeeded despite the error (timeout after admission, connection drop).
            // Only treat the Deployment as absent on an explicit NotFound; any other read failure
            // leaves presence uncertain.
            try {
                const existing = await this.appsApi.readNamespacedDeployment({
                    name,
                    namespace
                });
                return Ok(existing);
            } catch (readErr: any) {
                if (this.notFound(readErr)) {
                    return Err(new DeploymentAbsentError(createErr));
                }
                return Err(new Error('Failed to verify deployment after create', { cause: readErr }));
            }
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

    private async createNetworkPolicies(namespace: string, nodeId: number, name: string): Promise<Result<void>> {
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
                                    matchLabels: this.jobsNamespaceMatchLabels()
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
                podSelector: this.runnerPodSelector(name),
                policyTypes: ['Egress'],
                egress: this.buildRunnerEgressRules()
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

    private buildRunnerEgressRules(): k8s.V1NetworkPolicyEgressRule[] {
        const nangoPodSelector = toV1LabelSelector(envs.RUNNER_EGRESS_NANGO_POD_SELECTOR);
        const outboundPolicy = resolvePolicyForRunnerSync({
            proxyBaseUrlOverrideEnabled: String(envs.NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED),
            proxyBaseUrlOverrideDenylistRaw:
                envs.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST.length > 0 ? JSON.stringify(envs.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST) : undefined,
            outboundUrlPolicy: envs.NANGO_OUTBOUND_URL_POLICY ?? undefined
        });
        const exceptCidrs = ipv4ExceptCidrsForNetworkPolicy(outboundPolicy);
        const dnsPorts: k8s.V1NetworkPolicyPort[] = [
            { protocol: 'UDP', port: 53 },
            { protocol: 'TCP', port: 53 }
        ];

        return [
            {
                to: [
                    {
                        namespaceSelector: {
                            matchLabels: this.jobsNamespaceMatchLabels()
                        },
                        podSelector: nangoPodSelector
                    }
                ],
                ports: envs.RUNNER_EGRESS_NANGO_PORTS.map((port) => ({ protocol: 'TCP', port }))
            },
            {
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
                ports: dnsPorts
            },
            {
                to: [{ ipBlock: { cidr: '169.254.20.10/32' } }],
                ports: dnsPorts
            },
            {
                to: [
                    {
                        ipBlock: {
                            cidr: '0.0.0.0/0',
                            except: exceptCidrs
                        }
                    }
                ]
            }
        ];
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
