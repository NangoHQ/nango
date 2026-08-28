import { createHmac } from 'node:crypto';

import { INTERNAL_SERVICE_RUNNER_KEY_INFO } from './constants.js';

export type InternalAuthEnvs = {
    NANGO_INTERNAL_AUTH_REQUIRED: boolean;
    NANGO_INTERNAL_AUTH_TOKEN?: string | undefined;
    NANGO_INTERNAL_AUTH_SIGNING_KEY?: string | undefined;
};

export function trimOrNull(value: string | undefined): string | null {
    const token = value?.trim();
    return token || null;
}

/**
 * Deterministic runner verify key. Same jobs signing key always yields the same derived key.
 * The jobs master key never goes on a runner; this value does.
 */
export function deriveRunnerSigningKey(jobsSigningKey: string | null | undefined): string | null {
    const key = trimOrNull(jobsSigningKey ?? undefined);
    if (!key) {
        return null;
    }
    return createHmac('sha256', key).update(INTERNAL_SERVICE_RUNNER_KEY_INFO).digest('base64url');
}

export function getInternalAuthBearerHeaderIfPresent(token: string | null | undefined): Record<string, string> {
    if (!token) {
        return {};
    }
    return { Authorization: `Bearer ${token}` };
}
