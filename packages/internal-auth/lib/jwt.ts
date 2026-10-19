import { decodeProtectedHeader, importJWK, importPKCS8, jwtVerify, SignJWT } from 'jose';
import * as z from 'zod';

import { normalizePem } from '@nangohq/utils';

import { INTERNAL_SERVICE_ISSUER_JOBS, INTERNAL_SERVICE_ISSUER_SERVER } from './constants.js';

import type { InternalServiceAuth, InternalServiceIssuer, TaskCapabilityResource } from './constants.js';
import type { InternalAuthPublicKey } from '@nangohq/types';
import type { CryptoKey, JWTPayload } from 'jose';

export interface KeyRegistryEntry {
    iss: InternalServiceIssuer;
    /** base64url of the raw 32-byte Ed25519 public key. */
    publicKey: string;
}

export type KeyRegistry = Record<string, KeyRegistryEntry>;

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
    scopes?: readonly string[];
}

const privateKeyCache = new Map<string, Promise<CryptoKey>>();
const publicKeyCache = new Map<string, Promise<CryptoKey>>();

export function keyRegistryFromPublicKeys(entries: readonly InternalAuthPublicKey[] | undefined, iss: InternalServiceIssuer): KeyRegistry {
    if (!entries) {
        return {};
    }
    const registry: KeyRegistry = {};
    for (const entry of entries) {
        registry[entry.kid] = { iss, publicKey: entry.publicKey };
    }
    return registry;
}

export function mergeKeyRegistries(...registries: KeyRegistry[]): KeyRegistry {
    const merged: KeyRegistry = {};
    for (const registry of registries) {
        Object.assign(merged, registry);
    }
    return merged;
}

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

function loadPublicKey(rawPublicKey: string): Promise<CryptoKey> {
    const cached = publicKeyCache.get(rawPublicKey);
    if (cached) {
        return cached;
    }
    const pending = importJWK({ kty: 'OKP', crv: 'Ed25519', x: rawPublicKey, alg: 'EdDSA' }, 'EdDSA').then((key) => {
        if (key instanceof Uint8Array) {
            throw new Error('Ed25519 public key import returned raw bytes');
        }
        return key;
    });
    publicKeyCache.set(rawPublicKey, pending);
    return pending;
}

function capabilityPayload(claims: MintClaims): JWTPayload {
    const payload: JWTPayload = {};
    if (claims.res !== undefined) {
        const res: Record<string, number | string> = { environmentId: claims.res.environmentId };
        if (claims.res.connectionId !== undefined) {
            res['connectionId'] = claims.res.connectionId;
        }
        if (claims.res.syncId !== undefined) {
            res['syncId'] = claims.res.syncId;
        }
        payload['res'] = res;
    }
    if (claims.scopes !== undefined) {
        payload['scopes'] = [...claims.scopes];
    }
    return payload;
}

/** Mint one EdDSA JWT. `iss` is the signing service. `sub` is that service, a task, or a node. */
export async function mint(signer: MintSigner, claims: MintClaims): Promise<string> {
    const key = await loadPrivateKey(signer.privateKey);
    const iat = claims.issuedAt ?? Math.floor(Date.now() / 1000);
    const audience = typeof claims.aud === 'string' ? claims.aud : [...claims.aud];
    return await new SignJWT(capabilityPayload(claims))
        .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: signer.kid })
        .setIssuer(signer.iss)
        .setSubject(claims.sub)
        .setAudience(audience)
        .setIssuedAt(iat)
        .setExpirationTime(iat + claims.ttlSecs)
        .sign(key);
}

export interface UnifiedVerifyResult {
    auth: InternalServiceAuth | null;
    /**
     * True when the header carries a `kid`. A failed kid token selected a key and must not be
     * retried against a verifier that ignores `kid`.
     */
    kidBound: boolean;
}

const taskCapabilityResourceSchema = z
    .object({
        environmentId: z.number().int().positive(),
        connectionId: z.number().int().positive().optional(),
        syncId: z.string().min(1).optional()
    })
    .strict();

const capabilityClaimsSchema = z
    .object({
        res: taskCapabilityResourceSchema.optional(),
        scopes: z.array(z.string().min(1)).optional()
    })
    .strict();

/** `null` means a present claim has the wrong type. Omitted claims are absent, not invalid. */
function claimsFromPayload(payload: JWTPayload): Pick<InternalServiceAuth, 'res' | 'scopes'> | null {
    const candidate: { res?: unknown; scopes?: unknown } = {};
    if (payload['res'] !== undefined) {
        candidate.res = payload['res'];
    }
    if (payload['scopes'] !== undefined) {
        candidate.scopes = payload['scopes'];
    }
    const parsed = capabilityClaimsSchema.safeParse(candidate);
    if (!parsed.success) {
        return null;
    }
    const claims: Pick<InternalServiceAuth, 'res' | 'scopes'> = {};
    if (parsed.data.res !== undefined) {
        const res: TaskCapabilityResource = { environmentId: parsed.data.res.environmentId };
        if (parsed.data.res.connectionId !== undefined) {
            res.connectionId = parsed.data.res.connectionId;
        }
        if (parsed.data.res.syncId !== undefined) {
            res.syncId = parsed.data.res.syncId;
        }
        claims.res = res;
    }
    if (parsed.data.scopes !== undefined) {
        claims.scopes = parsed.data.scopes;
    }
    return claims;
}

/**
 * Verify a `kid` EdDSA token against the registry.
 * `kidBound` is false only when the token has no key id, so a caller may try the legacy kid-less verifier.
 * Callers must not fall through to the static secret when this returns no auth.
 */
export async function verify(token: string, audience: string, registry: KeyRegistry): Promise<UnifiedVerifyResult> {
    let kid: string;
    try {
        const header = decodeProtectedHeader(token);
        if (header.alg !== 'EdDSA' || header.typ !== 'JWT' || typeof header.kid !== 'string' || header.kid.length === 0) {
            return { auth: null, kidBound: false };
        }
        kid = header.kid;
    } catch {
        return { auth: null, kidBound: false };
    }

    const entry = registry[kid];
    if (!entry) {
        return { auth: null, kidBound: true };
    }

    try {
        const key = await loadPublicKey(entry.publicKey);
        const { payload } = await jwtVerify(token, key, {
            algorithms: ['EdDSA'],
            audience,
            issuer: entry.iss,
            typ: 'JWT',
            clockTolerance: 0,
            requiredClaims: ['iss', 'sub', 'aud', 'exp']
        });
        if (payload.iss !== entry.iss || typeof payload.sub !== 'string' || payload.sub.length === 0) {
            return { auth: null, kidBound: true };
        }
        const scope = claimsFromPayload(payload);
        if (!scope) {
            return { auth: null, kidBound: true };
        }
        return {
            auth: {
                kind: 'jwt',
                subject: payload.sub,
                sub: payload.sub,
                issuer: entry.iss,
                audience,
                ...scope
            },
            kidBound: true
        };
    } catch {
        return { auth: null, kidBound: true };
    }
}
