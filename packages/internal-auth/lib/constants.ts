import type { TaskCapabilityResource } from './jwt.js';
import type { ScriptType } from '@nangohq/types';

export const INTERNAL_SERVICE_TOKEN_ISSUER = 'nango-internal';
export const INTERNAL_SERVICE_ISSUER_JOBS = 'service:jobs';
export const INTERNAL_SERVICE_ISSUER_SERVER = 'service:server';
export const INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR = 'orchestrator';
export const INTERNAL_SERVICE_AUDIENCE_JOBS = 'jobs';
export const INTERNAL_SERVICE_AUDIENCE_RUNNER = 'runner';
export const INTERNAL_SERVICE_AUDIENCE_PERSIST = 'persist';
export const INTERNAL_SERVICE_AUDIENCE_SERVER = 'server';
/** One task workload token is presented to jobs, persist, and the script public API. */
export const INTERNAL_SERVICE_TASK_CAPABILITY_AUDIENCES = [
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    INTERNAL_SERVICE_AUDIENCE_PERSIST,
    INTERNAL_SERVICE_AUDIENCE_SERVER
] as const;
/** Short-lived service-to-service token. Minted per request. */
export const INTERNAL_SERVICE_TOKEN_TTL_SECS = 300;
/** Info string for HKDF-style Ed25519 seed from the jobs HMAC signing key. */
export const INTERNAL_SERVICE_RUNNER_ED25519_INFO = 'nango-internal-runner-ed25519';
// Longest runner tasks are scheduled syncs (orchestrator startedToCompleted is 1 day). +1h covers
// clock skew and a late heartbeat; there is no refresh. Callers pass expiresInSecs to override
export const INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS = 24 * 3600 + 3600;
/** Node-bound runner token covers register plus idle over the pod lifetime. */
export const INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS = 365 * 24 * 3600;
export const INTERNAL_SERVICE_AUTH_LOCALS_KEY = 'internalServiceAuth';

export const TASK_CAPABILITY_SCOPES = {
    persistLog: 'persist:log',
    persistRecords: 'persist:records',
    persistCheckpoint: 'persist:checkpoint',
    persistCursor: 'persist:cursor',
    persistLocks: 'persist:locks',
    persistTelemetry: 'persist:telemetry',
    persistAbort: 'persist:abort',
    persistSyncConflict: 'persist:sync-conflict',
    jobsHeartbeat: 'jobs:heartbeat',
    jobsPutTask: 'jobs:putTask',
    apiConnectionRead: 'api:connection:read',
    apiIntegrationRead: 'api:integration:read',
    apiMetadataWrite: 'api:metadata:write',
    apiEnvVarsRead: 'api:env-vars:read',
    apiSyncTrigger: 'api:sync:trigger',
    apiActionTrigger: 'api:action:trigger',
    apiProxy: 'api:proxy'
} as const;

export type TaskCapabilityScope = (typeof TASK_CAPABILITY_SCOPES)[keyof typeof TASK_CAPABILITY_SCOPES];

const BASE_TASK_SCOPES: readonly TaskCapabilityScope[] = [
    TASK_CAPABILITY_SCOPES.persistLog,
    TASK_CAPABILITY_SCOPES.persistCheckpoint,
    TASK_CAPABILITY_SCOPES.persistLocks,
    TASK_CAPABILITY_SCOPES.persistTelemetry,
    TASK_CAPABILITY_SCOPES.persistAbort,
    TASK_CAPABILITY_SCOPES.jobsHeartbeat,
    TASK_CAPABILITY_SCOPES.jobsPutTask,
    TASK_CAPABILITY_SCOPES.apiConnectionRead,
    TASK_CAPABILITY_SCOPES.apiIntegrationRead,
    TASK_CAPABILITY_SCOPES.apiMetadataWrite,
    TASK_CAPABILITY_SCOPES.apiEnvVarsRead,
    TASK_CAPABILITY_SCOPES.apiSyncTrigger,
    TASK_CAPABILITY_SCOPES.apiActionTrigger,
    TASK_CAPABILITY_SCOPES.apiProxy
];

const SYNC_TASK_SCOPES: readonly TaskCapabilityScope[] = [
    ...BASE_TASK_SCOPES,
    TASK_CAPABILITY_SCOPES.persistRecords,
    TASK_CAPABILITY_SCOPES.persistCursor,
    TASK_CAPABILITY_SCOPES.persistSyncConflict
];

export function taskScopesForScriptType(scriptType: ScriptType): readonly TaskCapabilityScope[] {
    return scriptType === 'sync' || scriptType === 'webhook' ? SYNC_TASK_SCOPES : BASE_TASK_SCOPES;
}

export type InternalServiceTokenOp = 'task' | 'node';

export type InternalServiceAuthKind = 'hmac' | 'static' | 'eddsa' | 'jwt';

export type InternalServiceIssuer = typeof INTERNAL_SERVICE_ISSUER_JOBS | typeof INTERNAL_SERVICE_ISSUER_SERVER;

export interface InternalServiceAuth {
    kind: InternalServiceAuthKind;
    subject: string;
    audience: string;
    op?: InternalServiceTokenOp;
    taskId?: string;
    nodeId?: string;
    /** Unified JWT issuer (`service:jobs` or `service:server`). */
    issuer?: InternalServiceIssuer;
    /** Unified JWT `sub` (`service:*`, `task:<id>`, or `node:<id>`). */
    sub?: string;
    /**
     * Resource the task may act on (`res`). Absent on service and node tokens.
     * `environmentId` is required when the claim is present.
     */
    res?: TaskCapabilityResource | undefined;
    /** Scopes the task may call. Absent on service and node tokens, and on legacy task tokens. */
    scopes?: readonly string[] | undefined;
}

export function taskSubject(taskId: string): string {
    return `task:${taskId}`;
}

export function nodeSubject(nodeId: string): string {
    return `node:${nodeId}`;
}
