export const INTERNAL_SERVICE_TOKEN_ISSUER = 'nango-internal';
export const INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR = 'orchestrator';
export const INTERNAL_SERVICE_AUDIENCE_JOBS = 'jobs';
export const INTERNAL_SERVICE_AUDIENCE_RUNNER = 'runner';
export const INTERNAL_SERVICE_AUDIENCE_PERSIST = 'persist';
export const INTERNAL_SERVICE_AUDIENCE_SERVER = 'server';
/** Capability tokens are presented to jobs, persist, and the public API. */
export const INTERNAL_SERVICE_TASK_CAPABILITY_AUDIENCES = [
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    INTERNAL_SERVICE_AUDIENCE_PERSIST,
    INTERNAL_SERVICE_AUDIENCE_SERVER
] as const;
/** Info string for HKDF-style Ed25519 seed from the jobs HMAC signing key. */
export const INTERNAL_SERVICE_RUNNER_ED25519_INFO = 'nango-internal-runner-ed25519';
// Longest runner tasks are scheduled syncs (orchestrator startedToCompleted is 1 day). +1h covers
// clock skew and a late heartbeat; there is no refresh. Callers pass expiresInSecs to override
export const INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS = 24 * 3600 + 3600;
/** Node-bound runner token covers register plus idle over the pod lifetime. */
export const INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS = 365 * 24 * 3600;
export const INTERNAL_SERVICE_AUTH_LOCALS_KEY = 'internalServiceAuth';

export type InternalServiceTokenOp = 'task' | 'node';

export type InternalServiceAuthKind = 'hmac' | 'static' | 'eddsa';

export const TASK_CAPABILITY_ACTIONS = {
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

export type TaskCapabilityAction = (typeof TASK_CAPABILITY_ACTIONS)[keyof typeof TASK_CAPABILITY_ACTIONS];

const BASE_TASK_ACTIONS: readonly TaskCapabilityAction[] = [
    TASK_CAPABILITY_ACTIONS.persistLog,
    TASK_CAPABILITY_ACTIONS.persistCheckpoint,
    TASK_CAPABILITY_ACTIONS.persistLocks,
    TASK_CAPABILITY_ACTIONS.persistTelemetry,
    TASK_CAPABILITY_ACTIONS.persistAbort,
    TASK_CAPABILITY_ACTIONS.jobsHeartbeat,
    TASK_CAPABILITY_ACTIONS.jobsPutTask,
    TASK_CAPABILITY_ACTIONS.apiConnectionRead,
    TASK_CAPABILITY_ACTIONS.apiIntegrationRead,
    TASK_CAPABILITY_ACTIONS.apiMetadataWrite,
    TASK_CAPABILITY_ACTIONS.apiEnvVarsRead,
    TASK_CAPABILITY_ACTIONS.apiSyncTrigger,
    TASK_CAPABILITY_ACTIONS.apiActionTrigger,
    TASK_CAPABILITY_ACTIONS.apiProxy
];

const SYNC_TASK_ACTIONS: readonly TaskCapabilityAction[] = [
    ...BASE_TASK_ACTIONS,
    TASK_CAPABILITY_ACTIONS.persistRecords,
    TASK_CAPABILITY_ACTIONS.persistCursor,
    TASK_CAPABILITY_ACTIONS.persistSyncConflict
];

export function taskActionsForScriptType(scriptType: 'function' | 'sync' | 'action' | 'webhook' | 'on-event'): readonly TaskCapabilityAction[] {
    return scriptType === 'sync' || scriptType === 'webhook' ? SYNC_TASK_ACTIONS : BASE_TASK_ACTIONS;
}

export interface InternalServiceAuth {
    kind: InternalServiceAuthKind;
    subject: string;
    audience: string;
    op?: InternalServiceTokenOp;
    taskId?: string;
    nodeId?: string;
    environmentId?: number;
    connectionId?: number;
    syncId?: string;
    actions?: readonly string[];
}
