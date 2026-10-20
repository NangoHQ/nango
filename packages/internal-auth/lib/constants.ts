export const INTERNAL_SERVICE_TOKEN_ISSUER = 'nango-internal';
export const INTERNAL_SERVICE_ISSUER_JOBS = 'service:jobs';
export const INTERNAL_SERVICE_ISSUER_SERVER = 'service:server';
export const INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR = 'orchestrator';
export const INTERNAL_SERVICE_AUDIENCE_JOBS = 'jobs';
export const INTERNAL_SERVICE_AUDIENCE_RUNNER = 'runner';
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
}

export function taskSubject(taskId: string): string {
    return `task:${taskId}`;
}

export function nodeSubject(nodeId: string): string {
    return `node:${nodeId}`;
}
