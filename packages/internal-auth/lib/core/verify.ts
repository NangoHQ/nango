import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose';

import type { KeyRegistry } from './registry.js';
import type { CryptoKey, JWTPayload } from 'jose';

const publicKeyCache = new Map<string, Promise<CryptoKey>>();

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

export interface VerifiedKidJwt {
    iss: string;
    sub: string;
    audience: string;
    payload: JWTPayload;
}

export interface KidJwtResult {
    jwt: VerifiedKidJwt | null;
    /**
     * True when the header carries a `kid`. A failed kid token selected a key and must not be
     * retried against a verifier that ignores `kid`.
     */
    kidBound: boolean;
}

/**
 * Verify a `kid` EdDSA token against the registry.
 * `kidBound` is false only when the token has no key id, so a caller may try the legacy kid-less verifier.
 */
export async function verifyKidJwt(token: string, audience: string, registry: KeyRegistry): Promise<KidJwtResult> {
    let kid: string;
    try {
        const header = decodeProtectedHeader(token);
        if (header.alg !== 'EdDSA' || header.typ !== 'JWT' || typeof header.kid !== 'string' || header.kid.length === 0) {
            return { jwt: null, kidBound: false };
        }
        kid = header.kid;
    } catch {
        return { jwt: null, kidBound: false };
    }

    const entry = registry[kid];
    if (!entry) {
        return { jwt: null, kidBound: true };
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
            return { jwt: null, kidBound: true };
        }
        return {
            jwt: { iss: entry.iss, sub: payload.sub, audience, payload },
            kidBound: true
        };
    } catch {
        return { jwt: null, kidBound: true };
    }
}
