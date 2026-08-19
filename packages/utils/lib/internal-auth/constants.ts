export const INTERNAL_SERVICE_TOKEN_ISSUER = 'nango-internal';
export const INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR = 'orchestrator';
export const INTERNAL_SERVICE_AUDIENCE_JOBS = 'jobs';
export const INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS = 7 * 24 * 3600;
export const INTERNAL_SERVICE_AUTH_LOCALS_KEY = 'internalServiceAuth';

export const RUNNER_INTERNAL_AUTH_TOKEN_MOUNT_PATH = '/var/run/secrets/nango/tokens';
export const RUNNER_INTERNAL_AUTH_TOKEN_FILENAME = 'jobs';

export type InternalServiceAuthKind = 'hmac' | 'kubernetes' | 'static';

export interface InternalServiceAuth {
    kind: InternalServiceAuthKind;
    subject: string;
    audience: string;
    taskId?: string;
}
