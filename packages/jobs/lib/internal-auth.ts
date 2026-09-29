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
    signerFromEnv,
    taskSubject
} from '@nangohq/internal-auth';

import { envs } from './env.js';

import type { NangoProps } from '@nangohq/types';

function taskExpiresInSecs(nangoProps?: Pick<NangoProps, 'lifecycle'>): number {
    const killAfterMs = nangoProps?.lifecycle?.killAfterMs;
    return killAfterMs !== undefined ? Math.max(60, Math.ceil(killAfterMs / 1000) + 60) : INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS;
}

function jobsSigner() {
    return signerFromEnv(INTERNAL_SERVICE_ISSUER_JOBS, envs.NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY, envs.NANGO_INTERNAL_AUTH_JOBS_KEY_ID);
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

    // Public keys alone are not a credential jobs can present. Leave the runner env empty so
    // REQUIRED is not turned on while jobs has nothing to mint.
    if (!nodeToken && !legacyPublicKey) {
        return {};
    }

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
    env['NANGO_INTERNAL_AUTH_REQUIRED'] = envs.NANGO_INTERNAL_AUTH_REQUIRED ? 'true' : 'false';
    return env;
}

/**
 * Jobs with REQUIRED and jobs public keys will copy that onto runners. Refuse to start when jobs
 * cannot mint a credential those runners will accept.
 */
export function assertRunnerAuthMaterial({
    required = Boolean(envs.NANGO_INTERNAL_AUTH_REQUIRED),
    jobsPublicKeys = envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS,
    signingKey = envs.NANGO_INTERNAL_AUTH_SIGNING_KEY,
    privateKey = envs.NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY,
    keyId = envs.NANGO_INTERNAL_AUTH_JOBS_KEY_ID
}: {
    required?: boolean;
    jobsPublicKeys?: string | undefined;
    signingKey?: string | undefined;
    privateKey?: string | undefined;
    keyId?: string | undefined;
} = {}): void {
    if (!required || !jobsPublicKeys?.trim()) {
        return;
    }
    if (signingKey?.trim() || (privateKey?.trim() && keyId?.trim())) {
        return;
    }
    throw new Error(
        'NANGO_INTERNAL_AUTH_REQUIRED is true and NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS is set, but jobs has no private key or HMAC signing key to mint runner credentials.'
    );
}
