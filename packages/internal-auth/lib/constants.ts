export const INTERNAL_SERVICE_TOKEN_ISSUER = 'nango-internal';
export const INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR = 'orchestrator';
export const INTERNAL_SERVICE_AUDIENCE_JOBS = 'jobs';
// Longest runner tasks are scheduled syncs (orchestrator startedToCompleted is 1 day). +1h covers
// clock skew and a late heartbeat; there is no refresh. Callers pass expiresInSecs to override
export const INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS = 24 * 3600 + 3600;
/** Covers image pull plus boot. Register happens once; after success a stolen token is useless. */
export const INTERNAL_SERVICE_REGISTER_TOKEN_EXPIRES_SECS = 3600;
/** Busy runner pods outlive the 25h task default. Idle is node-bound, so a long TTL is acceptable. */
export const INTERNAL_SERVICE_IDLE_TOKEN_EXPIRES_SECS = 30 * 24 * 3600;
export const INTERNAL_SERVICE_AUTH_LOCALS_KEY = 'internalServiceAuth';

export type InternalServiceTokenOp = 'task' | 'register' | 'idle';

export type InternalServiceAuthKind = 'hmac' | 'static';

export interface InternalServiceAuth {
    kind: InternalServiceAuthKind;
    subject: string;
    audience: string;
    op?: InternalServiceTokenOp;
    taskId?: string;
    nodeId?: string;
}
