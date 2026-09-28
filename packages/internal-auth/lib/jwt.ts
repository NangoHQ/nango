import { decodeProtectedHeader, importJWK, importPKCS8, jwtVerify, SignJWT } from 'jose';

import { parseInternalAuthPublicKeys } from '@nangohq/utils';

import type { InternalServiceAuth, InternalServiceIssuer } from './constants.js';

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

export interface MintClaims {
    sub: string;
    aud: string;
    ttlSecs: number;
    issuedAt?: number;
}

const privateKeyCache = new Map<string, Promise<CryptoKey>>();
const publicKeyCache = new Map<string, Promise<CryptoKey>>();

/** Env files often store PEM with escaped newlines. */
export function normalizePem(value: string): string {
    const trimmed = value.trim();
    return trimmed.includes('\\n') ? trimmed.replace(/\\n/g, '\n') : trimmed;
}

export function keyRegistryFromPublicKeys(raw: string | undefined, iss: InternalServiceIssuer): KeyRegistry {
    const entries = parseInternalAuthPublicKeys(raw);
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

/**
 * Verify a `kid` EdDSA token against the registry. Returns null on any failure.
 * Callers must not fall through to the static secret after this returns null.
 */
export async function verify(token: string, audience: string, registry: KeyRegistry): Promise<InternalServiceAuth | null> {
    let kid: string;
    try {
        const header = decodeProtectedHeader(token);
        if (header.alg !== 'EdDSA' || header.typ !== 'JWT' || typeof header.kid !== 'string' || header.kid.length === 0) {
            return null;
        }
        kid = header.kid;
    } catch {
        return null;
    }

    const entry = registry[kid];
    if (!entry) {
        return null;
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
            return null;
        }
        return {
            kind: 'jwt',
            subject: payload.sub,
            sub: payload.sub,
            issuer: entry.iss,
            audience
        };
    } catch {
        return null;
    }
}
