import {
    createInternalServiceToken,
    createRunnerDispatchToken,
    exportRunnerPublicKey,
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    INTERNAL_SERVICE_AUDIENCE_RUNNER,
    INTERNAL_SERVICE_ISSUER_JOBS,
    INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS,
    INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS,
    INTERNAL_SERVICE_TOKEN_TTL_SECS,
    mint,
    nodeSubject,
    taskSubject
} from '@nangohq/internal-auth';

import { envs } from './env.js';

import type { NangoProps } from '@nangohq/types';

function taskExpiresInSecs(nangoProps?: Pick<NangoProps, 'lifecycle'>): number {
    const killAfterMs = nangoProps?.lifecycle?.killAfterMs;
    return killAfterMs !== undefined ? Math.max(60, Math.ceil(killAfterMs / 1000) + 60) : INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS;
}

function jobsSigner(): { iss: typeof INTERNAL_SERVICE_ISSUER_JOBS; kid: string; privateKey: string } | null {
    const privateKey = envs.NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY?.trim();
    const kid = envs.NANGO_INTERNAL_AUTH_JOBS_KEY_ID?.trim();
    if (!privateKey || !kid) {
        return null;
    }
    return { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid, privateKey };
}

/**
 * Mint a task-bound token for putTask/heartbeat. Uses the jobs Ed25519 key when configured,
 * otherwise the legacy HMAC signing key. Returns null when neither is set.
 */
export async function mintTaskAuthToken(taskId: string, nangoProps: Pick<NangoProps, 'lifecycle'>): Promise<string | null> {
    const expiresInSecs = taskExpiresInSecs(nangoProps);
    const signer = jobsSigner();
    if (signer) {
        return mint(signer, { sub: taskSubject(taskId), aud: INTERNAL_SERVICE_AUDIENCE_JOBS, ttlSecs: expiresInSecs });
    }
    return createInternalServiceToken({ taskId, expiresInSecs }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
}

/**
 * Mint a runner-audience token for jobs→runner dispatch. Bound to the task or node it may act on.
 * Uses the jobs Ed25519 key when configured, otherwise the legacy derived-Ed25519 dispatch token.
 */
export async function mintRunnerDispatchToken(
    args: { taskId: string; nangoProps?: Pick<NangoProps, 'lifecycle'> } | { nodeId: string }
): Promise<string | null> {
    const signer = jobsSigner();
    if (signer) {
        const sub = 'nodeId' in args ? nodeSubject(args.nodeId) : taskSubject(args.taskId);
        return mint(signer, { sub, aud: INTERNAL_SERVICE_AUDIENCE_RUNNER, ttlSecs: INTERNAL_SERVICE_TOKEN_TTL_SECS });
    }
    if ('nodeId' in args) {
        return createRunnerDispatchToken({ op: 'node', nodeId: args.nodeId }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
    }
    return createRunnerDispatchToken({ taskId: args.taskId, expiresInSecs: taskExpiresInSecs(args.nangoProps) }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
}

/**
 * Env injected onto a runner process. Empty when no auth material is configured so node start stays
 * a no-op. Never includes a private key, the static token, or the HMAC signing key.
 */
export async function mintRunnerAuthEnv(nodeId: number): Promise<Record<string, string>> {
    const signer = jobsSigner();
    const nodeToken = signer
        ? await mint(signer, {
              sub: nodeSubject(String(nodeId)),
              aud: INTERNAL_SERVICE_AUDIENCE_JOBS,
              ttlSecs: INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS
          })
        : createInternalServiceToken(
              {
                  op: 'node',
                  nodeId: String(nodeId),
                  expiresInSecs: INTERNAL_SERVICE_NODE_TOKEN_EXPIRES_SECS
              },
              envs.NANGO_INTERNAL_AUTH_SIGNING_KEY
          );
    const legacyPublicKey = exportRunnerPublicKey(envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
    const jobsPublicKeys = envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS?.trim();

    const env: Record<string, string> = {};
    if (nodeToken) {
        env['NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN'] = nodeToken;
    }
    if (legacyPublicKey) {
        env['NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY'] = legacyPublicKey;
    }
    if (jobsPublicKeys) {
        env['NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS'] = jobsPublicKeys;
    }
    if (Object.keys(env).length === 0) {
        return {};
    }
    env['NANGO_INTERNAL_AUTH_REQUIRED'] = envs.NANGO_INTERNAL_AUTH_REQUIRED ? 'true' : 'false';
    return env;
}
