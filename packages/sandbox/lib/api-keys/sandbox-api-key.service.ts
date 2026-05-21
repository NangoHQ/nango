import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

import { encryptionManager } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { ApiKeyScope, DBCustomerKey, Result } from '@nangohq/types';
import type { Algorithm, JwtPayload } from 'jsonwebtoken';
import type { Knex } from 'knex';

export const sandboxApiKeyPrefix = 'nango_sbx_v1_';
export const sandboxApiKeyAudience = 'sandbox';
export const sandboxApiKeyPurposes = ['dryrun', 'deploy'] as const;

export type SandboxApiKeyPurpose = (typeof sandboxApiKeyPurposes)[number];

const sandboxApiKeyAlgorithm: Algorithm = 'HS256';
const sandboxApiKeyType = 'JWT';
const sandboxApiKeyKidPattern = /^[1-9]\d*$/;
const sandboxApiKeyPurposesSet = new Set<string>(sandboxApiKeyPurposes);
const customerKeysTable = 'customer_keys';
const customerKeysRelationsTable = 'customer_keys_relations';

export const sandboxApiKeyBaseScopes = [
    'environment:connections:read',
    'environment:integrations:read',
    'environment:proxy'
] as const satisfies readonly ApiKeyScope[];

interface SandboxApiKeyPayload {
    kid: number;
    aud: typeof sandboxApiKeyAudience;
    purpose: SandboxApiKeyPurpose;
    dryrun_id?: string;
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
            sandbox_signing_secret_iv: null,
            sandbox_signing_secret_tag: null
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
    purpose,
    dryrunId,
    expiresAt,
    issuedAt = Date.now()
}: {
    parentApiKeyId: number;
    signingSecret: string;
    purpose: SandboxApiKeyPurpose;
    dryrunId?: string;
    expiresAt: Date;
    issuedAt?: number;
}): string {
    const expiresAtMs = expiresAt.getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= issuedAt) {
        throw new Error('Sandbox API key expiresAt must be in the future');
    }

    const token = jwt.sign(
        {
            aud: sandboxApiKeyAudience,
            purpose,
            ...(dryrunId ? { dryrun_id: dryrunId } : {}),
            iat: Math.floor(issuedAt / 1000),
            exp: Math.ceil(expiresAtMs / 1000)
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

class SandboxApiKeyService {
    public async createSandboxApiKey(
        trx: Knex,
        {
            parentApiKeyId,
            environmentId,
            purpose,
            dryrunId,
            expiresAt
        }: {
            parentApiKeyId: number;
            environmentId: number;
            purpose: SandboxApiKeyPurpose;
            dryrunId?: string;
            expiresAt: Date;
        }
    ): Promise<Result<string>> {
        try {
            const now = Date.now();
            const expiresAtMs = expiresAt.getTime();
            if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
                return Err(new Error('Sandbox API key expiresAt must be in the future'));
            }

            // Sandbox API keys are meant to stay short-lived; this cap can be modified if there is a good reason.
            const maxExpiresAt = new Date(now + 24 * 60 * 60 * 1000);
            const cappedExpiresAt = expiresAtMs > maxExpiresAt.getTime() ? maxExpiresAt : expiresAt;

            const token = await trx.transaction(async (innerTrx) => {
                const parentKey = await innerTrx<DBCustomerKey>(customerKeysTable)
                    .select(`${customerKeysTable}.*`)
                    .join(customerKeysRelationsTable, `${customerKeysRelationsTable}.customer_key_id`, `${customerKeysTable}.id`)
                    .where(`${customerKeysTable}.id`, parentApiKeyId)
                    .where(`${customerKeysTable}.key_type`, 'api')
                    .where(`${customerKeysRelationsTable}.entity_type`, 'environment')
                    .where(`${customerKeysRelationsTable}.entity_id`, environmentId)
                    .whereNull(`${customerKeysTable}.deleted_at`)
                    .forUpdate()
                    .first();

                if (!parentKey) {
                    throw Object.assign(new Error('Sandbox API key parent customer key was not found'), {
                        type: 'no_such_api_secret',
                        payload: { id: parentApiKeyId }
                    });
                }

                let signingSecret = decryptSandboxSigningSecret(parentKey);
                if (!signingSecret) {
                    signingSecret = createSandboxSigningSecret();
                    await innerTrx<DBCustomerKey>(customerKeysTable)
                        .where(`${customerKeysTable}.id`, parentApiKeyId)
                        .update({
                            ...encryptSandboxSigningSecret(signingSecret),
                            updated_at: innerTrx.fn.now() as unknown as Date
                        });
                }

                return createSandboxApiKeyToken({
                    parentApiKeyId: parentKey.id,
                    signingSecret,
                    purpose,
                    ...(dryrunId ? { dryrunId } : {}),
                    expiresAt: cappedExpiresAt
                });
            });

            return Ok(token);
        } catch (err) {
            return Err(err);
        }
    }
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

        return {
            kid: parsed.parentApiKeyId,
            aud: verified.aud,
            purpose: verified.purpose,
            ...(verified.dryrun_id ? { dryrun_id: verified.dryrun_id } : {}),
            exp: verified.exp,
            iat: verified.iat
        };
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

function isSandboxApiKeyJwtPayload(payload: JwtPayload): payload is JwtPayload & Pick<SandboxApiKeyPayload, 'aud' | 'purpose' | 'dryrun_id' | 'exp' | 'iat'> {
    return (
        payload.aud === sandboxApiKeyAudience &&
        typeof payload['purpose'] === 'string' &&
        sandboxApiKeyPurposesSet.has(payload['purpose']) &&
        (payload['dryrun_id'] === undefined || typeof payload['dryrun_id'] === 'string') &&
        typeof payload.exp === 'number' &&
        typeof payload.iat === 'number' &&
        Number.isSafeInteger(payload.exp) &&
        Number.isSafeInteger(payload.iat)
    );
}

export default new SandboxApiKeyService();
