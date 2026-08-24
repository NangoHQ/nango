import {
    createInternalServiceToken,
    INTERNAL_SERVICE_IDLE_TOKEN_EXPIRES_SECS,
    INTERNAL_SERVICE_REGISTER_TOKEN_EXPIRES_SECS,
    INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS
} from '@nangohq/internal-auth';

import type { NangoProps } from '@nangohq/types';

/**
 * Mint a task-bound HMAC JWT for putTask/heartbeat. Returns null when the signing key is unset so
 * invoke stays a no-op until infra is in place.
 */
export function mintTaskAuthToken(taskId: string, nangoProps: Pick<NangoProps, 'lifecycle'>): string | null {
    const killAfterMs = nangoProps.lifecycle?.killAfterMs;
    const expiresInSecs = killAfterMs !== undefined ? Math.max(60, Math.ceil(killAfterMs / 1000) + 60) : INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS;
    return createInternalServiceToken({ taskId, expiresInSecs });
}

/**
 * Node-bound register/idle JWTs for the runner process. Empty when the signing key is unset so
 * node start stays a no-op. Never includes TOKEN or SIGNING_KEY.
 */
export function mintRunnerAuthEnv(nodeId: number): Record<string, string> {
    const nodeIdStr = String(nodeId);
    const register = createInternalServiceToken({
        op: 'register',
        nodeId: nodeIdStr,
        expiresInSecs: INTERNAL_SERVICE_REGISTER_TOKEN_EXPIRES_SECS
    });
    const idle = createInternalServiceToken({
        op: 'idle',
        nodeId: nodeIdStr,
        expiresInSecs: INTERNAL_SERVICE_IDLE_TOKEN_EXPIRES_SECS
    });
    if (!register || !idle) {
        return {};
    }
    return {
        NANGO_INTERNAL_AUTH_REGISTER_TOKEN: register,
        NANGO_INTERNAL_AUTH_IDLE_TOKEN: idle
    };
}
