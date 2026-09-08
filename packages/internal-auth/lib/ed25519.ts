import { createHmac, createPrivateKey, createPublicKey } from 'node:crypto';

import { INTERNAL_SERVICE_RUNNER_ED25519_INFO } from './constants.js';
import { trimOrNull } from './credential.js';

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
