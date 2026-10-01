import { decodeProtectedHeader, importJWK, importPKCS8, jwtVerify, SignJWT } from 'jose';

import { normalizePem } from '@nangohq/utils';

import type { InternalServiceAuth, InternalServiceIssuer } from './constants.js';
import type { InternalAuthPublicKey } from '@nangohq/types';
import type { CryptoKey } from 'jose';

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

/** Signer from env. Empty or whitespace-only values are unset. */
export function signerFromEnv(iss: InternalServiceIssuer, privateKey: string | undefined, kid: string | undefined): MintSigner | null {
    const key = privateKey?.trim();
    const keyId = kid?.trim();
    if (!key || !keyId) {
        return null;
    }
    return { iss, kid: keyId, privateKey: key };
}

export interface MintClaims {
    sub: string;
    aud: string;
    ttlSecs: number;
    issuedAt?: number;
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

/**
 * Mint one EdDSA JWT. `iss` is the signing service. `sub` is that service, a task, or a node.
 */
export async function mint(signer: MintSigner, claims: MintClaims): Promise<string> {
    const key = await loadPrivateKey(signer.privateKey);
    const iat = claims.issuedAt ?? Math.floor(Date.now() / 1000);
    return await new SignJWT({})
        .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: signer.kid })
        .setIssuer(signer.iss)
        .setSubject(claims.sub)
        .setAudience(claims.aud)
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
        return {
            auth: {
                kind: 'jwt',
                subject: payload.sub,
                sub: payload.sub,
                issuer: entry.iss,
                audience
            },
            kidBound: true
        };
    } catch {
        return { auth: null, kidBound: true };
    }
}
