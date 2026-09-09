import {
    createInternalServiceToken,
    createRunnerDispatchToken,
    exportRunnerPublicKey,
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
 * Mint a runner-audience EdDSA JWT for jobs→runner dispatch. Signed with a private key that never
 * leaves jobs. Returns null when the signing key is unset.
 */
export function mintRunnerDispatchToken(args: { taskId: string; nangoProps?: Pick<NangoProps, 'lifecycle'> } | { nodeId: string }): string | null {
    if ('nodeId' in args) {
        return createRunnerDispatchToken({ op: 'node', nodeId: args.nodeId }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
    }
    return createRunnerDispatchToken({ taskId: args.taskId, expiresInSecs: taskExpiresInSecs(args.nangoProps) }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
}

/**
 * Env injected onto a runner process. Empty when the signing key is unset so node start stays a
 * no-op. Never includes TOKEN, the jobs master SIGNING_KEY, or any minting material — only the
 * Ed25519 public key (verify-only) and a jobs-audience node JWT.
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
    const publicKey = exportRunnerPublicKey(envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
    if (!token || !publicKey) {
        return {};
    }
    return {
        NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN: token,
        NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY: publicKey,
        NANGO_INTERNAL_AUTH_REQUIRED: envs.NANGO_INTERNAL_AUTH_REQUIRED ? 'true' : 'false'
    };
}
