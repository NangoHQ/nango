import { createHmac, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

import { trimOrNull } from '../nango/env.js';
import { INTERNAL_SERVICE_AUDIENCE_RUNNER, INTERNAL_SERVICE_RUNNER_ED25519_INFO, INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS } from '../nango/principals.js';
import { authFromPayload, base64UrlEncode, decodeBase64UrlStrict, tokenPayload } from './codec.js';
import { isJwtShape, jwtHeaderAlg } from './token.js';

import type { CreateInternalServiceTokenArgs, VerifyInternalServiceTokenResult } from './codec.js';
import type { KeyObject } from 'node:crypto';

/** PKCS#8 prefix for an Ed25519 private key whose OCTET STRING is the 32-byte seed (RFC 8410). */
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
/** SPKI prefix for an Ed25519 public key (RFC 8410). */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_PUBLIC_LEN = 32;

function runnerSeed(jobsSigningKey: string): Buffer {
    return createHmac('sha256', jobsSigningKey).update(INTERNAL_SERVICE_RUNNER_ED25519_INFO).digest();
}

export function deriveRunnerEd25519PrivateKey(jobsSigningKey: string | null | undefined): KeyObject | null {
    const key = trimOrNull(jobsSigningKey ?? undefined);
    if (!key) {
        return null;
    }
    const seed = runnerSeed(key);
    const pkcs8 = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
    return createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
}

/**
 * Compact verify-only material for runners: base64url of the 32-byte Ed25519 public key.
 * Cannot mint tokens. Deterministic from the jobs HMAC signing key.
 */
export function exportRunnerPublicKey(jobsSigningKey: string | null | undefined): string | null {
    const privateKey = deriveRunnerEd25519PrivateKey(jobsSigningKey);
    if (!privateKey) {
        return null;
    }
    const spki = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    return Buffer.from(spki).subarray(ED25519_SPKI_PREFIX.length).toString('base64url');
}

export function runnerPublicKeyFromEnv(publicKey: string | null | undefined): KeyObject | null {
    const raw = trimOrNull(publicKey ?? undefined);
    if (!raw) {
        return null;
    }
    try {
        const bytes = Buffer.from(raw, 'base64url');
        if (bytes.length !== ED25519_PUBLIC_LEN) {
            return null;
        }
        const spki = Buffer.concat([ED25519_SPKI_PREFIX, bytes]);
        return createPublicKey({ key: spki, format: 'der', type: 'spki' });
    } catch {
        return null;
    }
}

/**
 * Mint an EdDSA JWT for jobs→runner dispatch. Signed with a private key derived from the jobs
 * HMAC master; runners receive only the matching public key. Returns null when the signing key is unset.
 */
export function createRunnerDispatchToken(args: CreateInternalServiceTokenArgs, jobsSigningKey: string | null | undefined): string | null {
    const privateKey = deriveRunnerEd25519PrivateKey(jobsSigningKey);
    if (!privateKey) {
        return null;
    }

    const iat = args.issuedAt ?? Math.floor(Date.now() / 1000);
    const exp = iat + (args.expiresInSecs ?? INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS);
    const header = base64UrlEncode(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }));
    const payload = base64UrlEncode(JSON.stringify(tokenPayload({ ...args, audience: INTERNAL_SERVICE_AUDIENCE_RUNNER }, iat, exp)));
    const signingInput = `${header}.${payload}`;
    const signature = sign(null, Buffer.from(signingInput), privateKey);
    return `${signingInput}.${base64UrlEncode(signature)}`;
}

export function verifyRunnerDispatchToken(token: string, audience: string, runnerPublicKey: string | null | undefined): VerifyInternalServiceTokenResult {
    if (!isJwtShape(token)) {
        return { ok: false, reason: 'not_jwt' };
    }

    const publicKey = runnerPublicKeyFromEnv(runnerPublicKey);
    if (!publicKey) {
        return { ok: false, reason: 'no_signing_key' };
    }

    const [headerPart, payloadPart, signature] = token.split('.');
    if (!headerPart || !payloadPart || !signature) {
        return { ok: false, reason: 'not_jwt' };
    }

    if (jwtHeaderAlg(token) !== 'EdDSA') {
        return { ok: false, reason: 'bad_signature' };
    }

    const signatureBytes = decodeBase64UrlStrict(signature);
    if (!signatureBytes) {
        return { ok: false, reason: 'bad_signature' };
    }

    const signingInput = `${headerPart}.${payloadPart}`;
    try {
        if (!verify(null, Buffer.from(signingInput), publicKey, signatureBytes)) {
            return { ok: false, reason: 'bad_signature' };
        }
    } catch {
        return { ok: false, reason: 'bad_signature' };
    }

    return authFromPayload(payloadPart, audience, 'eddsa');
}
