import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

import { getEncryptionManager } from '../utils/encryption.manager.js';

import type { ApiKeyScope, DBCustomerKey } from '@nangohq/types';
import type { Algorithm, JwtPayload } from 'jsonwebtoken';

export const sandboxApiKeyPrefix = 'nango_sbx_v1_';
export const sandboxApiKeyAudience = 'sandbox';
export const sandboxApiKeyPurposes = ['dryrun', 'deploy'] as const;

export type SandboxApiKeyPurpose = (typeof sandboxApiKeyPurposes)[number];

const sandboxApiKeyAlgorithm: Algorithm = 'HS256';
const sandboxApiKeyType = 'JWT';
const sandboxApiKeyKidPattern = /^[1-9]\d*$/;

interface SandboxApiKeyPayloadBase {
    kid: number;
    aud: typeof sandboxApiKeyAudience;
    exp: number;
    iat: number;
}

interface SandboxDryrunApiKeyPayload extends SandboxApiKeyPayloadBase {
    purpose: 'dryrun';
    dryrun_id: string;
}

interface SandboxDeployApiKeyPayload extends SandboxApiKeyPayloadBase {
    purpose: 'deploy';
    deployment_id: string;
}

type SandboxApiKeyPayload = SandboxDryrunApiKeyPayload | SandboxDeployApiKeyPayload;
type SandboxApiKeyJwtPayload = Omit<SandboxDryrunApiKeyPayload, 'kid'> | Omit<SandboxDeployApiKeyPayload, 'kid'>;

interface CreateSandboxApiKeyTokenBase {
    parentApiKeyId: number;
    signingSecret: string;
    expiresAt: Date;
    issuedAt?: number;
}

interface CreateDryrunSandboxApiKeyTokenArgs extends CreateSandboxApiKeyTokenBase {
    purpose: 'dryrun';
    dryrunId: string;
}

interface CreateDeploySandboxApiKeyTokenArgs extends CreateSandboxApiKeyTokenBase {
    purpose: 'deploy';
    deploymentId: string;
}

type CreateSandboxApiKeyTokenArgs = CreateDryrunSandboxApiKeyTokenArgs | CreateDeploySandboxApiKeyTokenArgs;

export const sandboxApiKeyBaseScopes = [
    'environment:connections:read',
    'environment:integrations:read',
    'environment:proxy'
] as const satisfies readonly ApiKeyScope[];

export function isSandboxApiKey(secret: string): boolean {
    return secret.startsWith(sandboxApiKeyPrefix);
}

export function buildSandboxApiKeyScopes(parentScopes: string[] | null | undefined): ApiKeyScope[] {
    const scopes = new Set<string>();

    for (const scope of parentScopes ?? []) {
        scopes.add(scope);
    }

    for (const scope of sandboxApiKeyBaseScopes) {
        scopes.add(scope);
    }

    return Array.from(scopes) as ApiKeyScope[];
}

export function createSandboxSigningSecret(): string {
    return crypto.randomBytes(32).toString('base64url');
}

export function encryptSandboxSigningSecret(
    signingSecret: string
): Pick<DBCustomerKey, 'sandbox_signing_secret' | 'sandbox_signing_secret_iv' | 'sandbox_signing_secret_tag'> {
    if (!getEncryptionManager().shouldEncrypt()) {
        return {
            sandbox_signing_secret: signingSecret,
            sandbox_signing_secret_iv: null,
            sandbox_signing_secret_tag: null
        };
    }

    const [encrypted, iv, tag] = getEncryptionManager().encryptSync(signingSecret);
    return {
        sandbox_signing_secret: encrypted,
        sandbox_signing_secret_iv: iv,
        sandbox_signing_secret_tag: tag
    };
}

export function decryptSandboxSigningSecret(
    key: Pick<DBCustomerKey, 'sandbox_signing_secret' | 'sandbox_signing_secret_iv' | 'sandbox_signing_secret_tag'>
): string | null {
    if (!key.sandbox_signing_secret) {
        return null;
    }

    if (!getEncryptionManager().shouldEncrypt() || !key.sandbox_signing_secret_iv || !key.sandbox_signing_secret_tag) {
        return key.sandbox_signing_secret;
    }

    return getEncryptionManager().decryptSync(key.sandbox_signing_secret, key.sandbox_signing_secret_iv, key.sandbox_signing_secret_tag);
}

export function createSandboxApiKeyToken(args: CreateSandboxApiKeyTokenArgs): string {
    const { parentApiKeyId, signingSecret, expiresAt, issuedAt = Date.now() } = args;
    const expiresAtMs = expiresAt.getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= issuedAt) {
        throw new Error('Sandbox API key expiresAt must be in the future');
    }

    const basePayload = {
        aud: sandboxApiKeyAudience,
        purpose: args.purpose,
        iat: Math.floor(issuedAt / 1000),
        exp: Math.ceil(expiresAtMs / 1000)
    };
    const payload = args.purpose === 'dryrun' ? { ...basePayload, dryrun_id: args.dryrunId } : { ...basePayload, deployment_id: args.deploymentId };

    const token = jwt.sign(payload, signingSecret, {
        algorithm: sandboxApiKeyAlgorithm,
        header: {
            typ: sandboxApiKeyType,
            alg: sandboxApiKeyAlgorithm,
            kid: String(parentApiKeyId)
        }
    });

    return `${sandboxApiKeyPrefix}${token}`;
}

export function verifySandboxApiKeyToken({
    token,
    signingSecret,
    now = Date.now()
}: {
    token: string;
    signingSecret: string;
    now?: number;
}): SandboxApiKeyPayload | null {
    const parsed = parseSandboxApiKeyToken(token);
    if (!parsed) {
        return null;
    }

    try {
        const verified = jwt.verify(parsed.jwt, signingSecret, {
            algorithms: [sandboxApiKeyAlgorithm],
            audience: sandboxApiKeyAudience,
            clockTimestamp: Math.floor(now / 1000)
        });
        if (typeof verified === 'string' || !isSandboxApiKeyJwtPayload(verified)) {
            return null;
        }

        const basePayload = {
            kid: parsed.parentApiKeyId,
            aud: verified.aud,
            exp: verified.exp,
            iat: verified.iat
        };

        return verified.purpose === 'dryrun'
            ? { ...basePayload, purpose: verified.purpose, dryrun_id: verified.dryrun_id }
            : { ...basePayload, purpose: verified.purpose, deployment_id: verified.deployment_id };
    } catch {
        return null;
    }
}

export function parseSandboxApiKeyToken(token: string): { parentApiKeyId: number; jwt: string } | null {
    if (!isSandboxApiKey(token)) {
        return null;
    }

    const rawJwt = token.slice(sandboxApiKeyPrefix.length);
    if (!rawJwt) {
        return null;
    }

    // Decode the header before verification so we can read kid and fetch the matching signing secret.
    const decoded = jwt.decode(rawJwt, { complete: true });
    if (!decoded || decoded.header.alg !== sandboxApiKeyAlgorithm || decoded.header.typ !== sandboxApiKeyType || typeof decoded.header.kid !== 'string') {
        return null;
    }

    const parentApiKeyId = Number(decoded.header.kid);
    if (!sandboxApiKeyKidPattern.test(decoded.header.kid) || !Number.isSafeInteger(parentApiKeyId)) {
        return null;
    }

    return { parentApiKeyId, jwt: rawJwt };
}

function isSandboxApiKeyJwtPayload(payload: JwtPayload): payload is JwtPayload & SandboxApiKeyJwtPayload {
    if (
        payload.aud === sandboxApiKeyAudience &&
        typeof payload['purpose'] === 'string' &&
        typeof payload.exp === 'number' &&
        typeof payload.iat === 'number' &&
        Number.isSafeInteger(payload.exp) &&
        Number.isSafeInteger(payload.iat)
    ) {
        if (payload['purpose'] === 'dryrun') {
            return typeof payload['dryrun_id'] === 'string' && payload['deployment_id'] === undefined;
        }

        if (payload['purpose'] === 'deploy') {
            return typeof payload['deployment_id'] === 'string' && payload['dryrun_id'] === undefined;
        }
    }

    return false;
}
