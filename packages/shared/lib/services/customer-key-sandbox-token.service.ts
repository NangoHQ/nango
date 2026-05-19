import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

import encryptionManager from '../utils/encryption.manager.js';

import type { ApiKeyScope, DBCustomerKey } from '@nangohq/types';
import type { Algorithm, JwtPayload } from 'jsonwebtoken';

export const sandboxApiKeyPrefix = 'nango_sbx_v1_';
const sandboxApiKeyAlgorithm: Algorithm = 'HS256';
const sandboxApiKeyType = 'JWT';

export const sandboxApiKeyBaseScopes = [
    'environment:connections:read',
    'environment:integrations:read',
    'environment:proxy'
] as const satisfies readonly ApiKeyScope[];

interface SandboxApiKeyPayload {
    kid: number;
    exp: number;
    iat: number;
}

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
    if (!encryptionManager.shouldEncrypt()) {
        return {
            sandbox_signing_secret: signingSecret,
            sandbox_signing_secret_iv: '',
            sandbox_signing_secret_tag: ''
        };
    }

    const [encrypted, iv, tag] = encryptionManager.encryptSync(signingSecret);
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

    if (!encryptionManager.shouldEncrypt() || !key.sandbox_signing_secret_iv || !key.sandbox_signing_secret_tag) {
        return key.sandbox_signing_secret;
    }

    return encryptionManager.decryptSync(key.sandbox_signing_secret, key.sandbox_signing_secret_iv, key.sandbox_signing_secret_tag);
}

export function createSandboxApiKeyToken({
    parentApiKeyId,
    signingSecret,
    expiresAt,
    issuedAt = Date.now()
}: {
    parentApiKeyId: number;
    signingSecret: string;
    expiresAt: Date;
    issuedAt?: number;
}): string {
    const token = jwt.sign(
        {
            iat: Math.floor(issuedAt / 1000),
            exp: Math.ceil(expiresAt.getTime() / 1000)
        },
        signingSecret,
        {
            algorithm: sandboxApiKeyAlgorithm,
            header: {
                typ: sandboxApiKeyType,
                alg: sandboxApiKeyAlgorithm,
                kid: String(parentApiKeyId)
            }
        }
    );

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
            clockTimestamp: Math.floor(now / 1000),
            complete: true
        });
        if (
            verified.header.alg !== sandboxApiKeyAlgorithm ||
            verified.header.typ !== sandboxApiKeyType ||
            verified.header.kid !== String(parsed.parentApiKeyId) ||
            typeof verified.payload === 'string' ||
            !isSandboxApiKeyJwtPayload(verified.payload)
        ) {
            return null;
        }

        return { kid: parsed.parentApiKeyId, exp: verified.payload.exp, iat: verified.payload.iat };
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

    const decoded = jwt.decode(rawJwt, { complete: true });
    if (!decoded || decoded.header.alg !== sandboxApiKeyAlgorithm || decoded.header.typ !== sandboxApiKeyType || typeof decoded.header.kid !== 'string') {
        return null;
    }

    const parentApiKeyId = Number(decoded.header.kid);
    if (!Number.isSafeInteger(parentApiKeyId) || parentApiKeyId <= 0 || String(parentApiKeyId) !== decoded.header.kid) {
        return null;
    }

    return { parentApiKeyId, jwt: rawJwt };
}

function isSandboxApiKeyJwtPayload(payload: JwtPayload): payload is JwtPayload & Pick<SandboxApiKeyPayload, 'exp' | 'iat'> {
    return typeof payload.exp === 'number' && typeof payload.iat === 'number' && Number.isSafeInteger(payload.exp) && Number.isSafeInteger(payload.iat);
}
