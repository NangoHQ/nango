import {
    createInternalServiceToken,
    deriveRunnerSigningKey,
    INTERNAL_SERVICE_AUDIENCE_RUNNER,
    INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS,
    INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS
} from '@nangohq/internal-auth';

import { envs } from './env.js';

import type { NangoProps } from '@nangohq/types';

function taskExpiresInSecs(nangoProps?: Pick<NangoProps, 'lifecycle'>): number {
    const killAfterMs = nangoProps?.lifecycle?.killAfterMs;
    return killAfterMs !== undefined ? Math.max(60, Math.ceil(killAfterMs / 1000) + 60) : INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS;
}

/**
 * Mint a task-bound HMAC JWT for putTask/heartbeat. Returns null when the signing key is unset so
 * invoke stays a no-op until infra is in place.
 */
export function mintTaskAuthToken(taskId: string, nangoProps: Pick<NangoProps, 'lifecycle'>): string | null {
    return createInternalServiceToken({ taskId, expiresInSecs: taskExpiresInSecs(nangoProps) }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
}

/**
 * Mint a runner-audience HMAC JWT for jobs→runner dispatch. Signed with the derived runner key so
 * the jobs master key never leaves jobs. Returns null when the signing key is unset.
 */
export function mintRunnerDispatchToken(args: { taskId: string; nangoProps?: Pick<NangoProps, 'lifecycle'> } | { nodeId: string }): string | null {
    const derived = deriveRunnerSigningKey(envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
    if ('nodeId' in args) {
        return createInternalServiceToken({ audience: INTERNAL_SERVICE_AUDIENCE_RUNNER, op: 'node', nodeId: args.nodeId }, derived);
    }
    return createInternalServiceToken(
        { audience: INTERNAL_SERVICE_AUDIENCE_RUNNER, taskId: args.taskId, expiresInSecs: taskExpiresInSecs(args.nangoProps) },
        derived
    );
}

/**
 * Env injected onto a runner process. Empty when the signing key is unset so node start stays a
 * no-op. Never includes TOKEN or the jobs master SIGNING_KEY.
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
    const derived = deriveRunnerSigningKey(envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
    if (!token || !derived) {
        return {};
    }
    return {
        NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN: token,
        NANGO_INTERNAL_AUTH_SIGNING_KEY: derived,
        NANGO_INTERNAL_AUTH_REQUIRED: envs.NANGO_INTERNAL_AUTH_REQUIRED ? 'true' : 'false'
    };
}
