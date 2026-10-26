import { importPKCS8, SignJWT } from 'jose';
import * as z from 'zod';

import { normalizePem } from '@nangohq/utils';

import { INTERNAL_SERVICE_ISSUER_JOBS, INTERNAL_SERVICE_ISSUER_SERVER } from '../nango/principals.js';

import type { InternalServiceIssuer, TaskCapabilityResource } from '../nango/principals.js';
import type { TaskCapabilityScope } from '../nango/scopes.js';
import type { CryptoKey } from 'jose';

export interface MintSigner {
    iss: InternalServiceIssuer;
    kid: string;
    privateKey: string;
}

export interface SignerEnvs {
    NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY?: string | undefined;
    NANGO_INTERNAL_AUTH_JOBS_KEY_ID?: string | undefined;
    NANGO_INTERNAL_AUTH_SERVER_PRIVATE_KEY?: string | undefined;
    NANGO_INTERNAL_AUTH_SERVER_KEY_ID?: string | undefined;
}

const signerMaterial = {
    jobs: {
        iss: INTERNAL_SERVICE_ISSUER_JOBS,
        privateKey: (envs: SignerEnvs) => envs.NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY,
        keyId: (envs: SignerEnvs) => envs.NANGO_INTERNAL_AUTH_JOBS_KEY_ID
    },
    server: {
        iss: INTERNAL_SERVICE_ISSUER_SERVER,
        privateKey: (envs: SignerEnvs) => envs.NANGO_INTERNAL_AUTH_SERVER_PRIVATE_KEY,
        keyId: (envs: SignerEnvs) => envs.NANGO_INTERNAL_AUTH_SERVER_KEY_ID
    }
} as const;

export type InternalAuthService = keyof typeof signerMaterial;

/** Signer from env. Empty or whitespace-only values are unset. */
export function signerForService(service: InternalAuthService, envs: SignerEnvs): MintSigner | null {
    const material = signerMaterial[service];
    const privateKey = material.privateKey(envs)?.trim();
    const kid = material.keyId(envs)?.trim();
    if (!privateKey || !kid) {
        return null;
    }
    return { iss: material.iss, kid, privateKey };
}

export interface MintClaims {
    sub: string;
    aud: string | readonly string[];
    ttlSecs: number;
    issuedAt?: number;
    res?: TaskCapabilityResource;
    scopes?: readonly TaskCapabilityScope[];
}

const resourceIdError = 'task capability res requires a positive environmentId and connectionId';

const taskCapabilityResourceSchema = z.object({
    environmentId: z.int().positive({ error: resourceIdError }),
    connectionId: z.int().positive({ error: resourceIdError }),
    syncId: z.string().min(1, { error: 'task capability res.syncId must be a non-empty string' }).optional()
});

const privateKeyCache = new Map<string, Promise<CryptoKey>>();

function loadPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
    const pem = normalizePem(privateKeyPem);
    const cached = privateKeyCache.get(pem);
    if (cached) {
        return cached;
    }
    const pending = importPKCS8(pem, 'EdDSA');
    privateKeyCache.set(pem, pending);
    return pending;
}

/**
 * Mint one EdDSA JWT. `iss` is the signing service. `sub` is that service, a task, or a node.
 */
export async function mint(signer: MintSigner, claims: MintClaims): Promise<string> {
    const key = await loadPrivateKey(signer.privateKey);
    const iat = claims.issuedAt ?? Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = {};
    if (claims.res) {
        payload['res'] = taskCapabilityResourceSchema.parse(claims.res);
    }
    if (claims.scopes !== undefined) {
        payload['scopes'] = [...claims.scopes];
    }
    const audience = typeof claims.aud === 'string' ? claims.aud : [...claims.aud];
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: signer.kid })
        .setIssuer(signer.iss)
        .setSubject(claims.sub)
        .setAudience(audience)
        .setIssuedAt(iat)
        .setExpirationTime(iat + claims.ttlSecs)
        .sign(key);
}
