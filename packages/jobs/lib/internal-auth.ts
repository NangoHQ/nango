import { createInternalServiceToken, INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS } from '@nangohq/utils';

import type { NangoProps } from '@nangohq/types';

/**
 * Mint a task-bound HMAC JWT for putTask/heartbeat. Returns null when the signing key is unset so
 * invoke stays a no-op until infra is in place.
 */
export function mintTaskAuthToken(taskId: string, nangoProps: Pick<NangoProps, 'lifecycle'>): string | null {
    const killAfterMs = nangoProps.lifecycle?.killAfterMs;
    const expiresInSecs = killAfterMs ? Math.max(60, Math.ceil(killAfterMs / 1000) + 60) : INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS;
    return createInternalServiceToken({ taskId, expiresInSecs });
}
