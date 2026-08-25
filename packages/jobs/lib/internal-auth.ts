import { createInternalServiceToken, INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS, INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS } from '@nangohq/internal-auth';

import { envs } from './env.js';

import type { NangoProps } from '@nangohq/types';

/**
 * Mint a task-bound HMAC JWT for putTask/heartbeat. Returns null when the signing key is unset so
 * invoke stays a no-op until infra is in place.
 */
export function mintTaskAuthToken(taskId: string, nangoProps: Pick<NangoProps, 'lifecycle'>): string | null {
    const killAfterMs = nangoProps.lifecycle?.killAfterMs;
    const expiresInSecs = killAfterMs !== undefined ? Math.max(60, Math.ceil(killAfterMs / 1000) + 60) : INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS;
    return createInternalServiceToken({ taskId, expiresInSecs }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
}

/**
 * Node-bound JWT for the runner process (register and idle). Empty when the signing key is unset so
 * node start stays a no-op. Never includes TOKEN or SIGNING_KEY.
 */
export function mintRunnerAuthEnv(nodeId: number): Record<string, string> {
    const token = createInternalServiceToken(
        {
            op: 'node',
            nodeId: String(nodeId),
            expiresInSecs: INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS
        },
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY
    );
    if (!token) {
        return {};
    }
    return { NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN: token };
}
