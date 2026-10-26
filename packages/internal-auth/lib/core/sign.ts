import { importPKCS8, SignJWT } from 'jose';

import { normalizePem } from '@nangohq/utils';

import type { CryptoKey } from 'jose';

export interface JwtSigner {
    iss: string;
    kid: string;
    privateKey: string;
}

export interface SignJwtClaims {
    sub: string;
    aud: string | readonly string[];
    ttlSecs: number;
    issuedAt?: number;
    payload?: Record<string, unknown>;
}

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

/** Sign one EdDSA JWT. `payload` is the extra claims; `iss`, `sub`, and `aud` are set separately. */
export async function signJwt(signer: JwtSigner, claims: SignJwtClaims): Promise<string> {
    const key = await loadPrivateKey(signer.privateKey);
    const iat = claims.issuedAt ?? Math.floor(Date.now() / 1000);
    const audience = typeof claims.aud === 'string' ? claims.aud : [...claims.aud];
    return await new SignJWT(claims.payload ?? {})
        .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: signer.kid })
        .setIssuer(signer.iss)
        .setSubject(claims.sub)
        .setAudience(audience)
        .setIssuedAt(iat)
        .setExpirationTime(iat + claims.ttlSecs)
        .sign(key);
}
