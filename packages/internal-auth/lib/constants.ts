import type { ScriptType } from '@nangohq/types';

export const INTERNAL_SERVICE_TOKEN_ISSUER = 'nango-internal';
export const INTERNAL_SERVICE_ISSUER_JOBS = 'service:jobs';
export const INTERNAL_SERVICE_ISSUER_SERVER = 'service:server';
export const INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR = 'orchestrator';
export const INTERNAL_SERVICE_AUDIENCE_JOBS = 'jobs';
export const INTERNAL_SERVICE_AUDIENCE_RUNNER = 'runner';
export const INTERNAL_SERVICE_AUDIENCE_PERSIST = 'persist';
export const INTERNAL_SERVICE_AUDIENCE_SERVER = 'server';
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
    /** Present on a task capability token. Absent on service, node, and legacy tokens. */
    res?: TaskCapabilityResource;
    scopes?: readonly TaskCapabilityScope[];
}

/** Every scope a runner task can be minted with. Sync-only scopes are omitted for other script types. */
export const TASK_CAPABILITY_SCOPES = [
    'persist:log',
    'persist:records',
    'persist:cursor',
    'persist:checkpoint',
    'persist:locks',
    'persist:telemetry',
    'persist:abort',
    'persist:sync-conflict',
    'jobs:putTask',
    'jobs:heartbeat',
    'api:connection:read',
    'api:integration:read',
    'api:metadata:write',
    'api:env-vars:read',
    'api:sync:trigger',
    'api:action:trigger'
] as const;

export type TaskCapabilityScope = (typeof TASK_CAPABILITY_SCOPES)[number];

export interface TaskCapabilityResource {
    environmentId: number;
    connectionId: number;
    syncId?: string;
}

const SYNC_ONLY_SCOPES: ReadonlySet<TaskCapabilityScope> = new Set(['persist:records', 'persist:cursor', 'persist:sync-conflict']);

export function taskScopesForScriptType(scriptType: ScriptType): readonly TaskCapabilityScope[] {
    switch (scriptType) {
        case 'sync':
        case 'webhook':
            return [...TASK_CAPABILITY_SCOPES];
        case 'action':
        case 'on-event':
        case 'function':
            return TASK_CAPABILITY_SCOPES.filter((scope) => !SYNC_ONLY_SCOPES.has(scope));
    }
}

export function taskSubject(taskId: string): string {
    return `task:${taskId}`;
}

export function nodeSubject(nodeId: string): string {
    return `node:${nodeId}`;
}
