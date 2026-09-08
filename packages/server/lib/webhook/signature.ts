import crypto from 'node:crypto';

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

// Providers issue keys well above this. Svix is 24 bytes, GitLab 32. The floor only exists so a
// truncated or misconfigured secret cannot become a brute forceable hmac key. Per provider key
// contracts stay in the routing script, since they disagree on both length and prefix.
const MIN_KEY_BYTES = 16;

/**
 * Constant-time comparison that tolerates mismatched lengths.
 * timingSafeEqual throws when the two buffers differ in length, which turns a
 * malformed signature into a 500 instead of a 401.
 */
export function safeCompare(expected: string, received: string, encoding: BufferEncoding = 'utf8'): boolean {
    try {
        const expectedBuffer = Buffer.from(expected, encoding);
        const receivedBuffer = Buffer.from(received, encoding);

        return expectedBuffer.length > 0 && expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch {
        return false;
    }
}

/**
 * Replay window check. Providers that fold a timestamp into the signed payload all reject
 * anything outside a tolerance, they only differ in how wide it is.
 */
export function isFreshTimestamp(value: string | number, toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS): boolean {
    const seconds = Number(value);

    if (!Number.isSafeInteger(seconds)) {
        return false;
    }

    return Math.abs(Math.floor(Date.now() / 1000) - seconds) <= toleranceSeconds;
}

export interface HmacOptions {
    /** String only. A zero-length Buffer is truthy, so accepting Buffers here would let an empty key through. */
    secret: string;
    rawBody: string;
    signature: string;
    /**
     * What to HMAC, when the provider signs more than the body. Slack signs
     * `v0:{timestamp}:{rawBody}` and Calendly signs `{timestamp}.{rawBody}`.
     * Defaults to `rawBody`.
     */
    payload?: string;
    algorithm?: 'sha1' | 'sha256';
    /** Encoding of the digest, and of the signature we compare it against. */
    digest?: 'hex' | 'base64';
    /** Prefix the provider puts in front of the digest, e.g. `sha256=`. Stripped from the received signature when present. */
    prefix?: string;
}

/**
 * HMAC over the raw body, compared in constant time. Covers the scheme used by
 * most providers, differing only in algorithm, digest encoding and prefix.
 */
export function validateHmacSignature({ secret, rawBody, signature, payload, algorithm = 'sha256', digest = 'hex', prefix }: HmacOptions): boolean {
    if (!secret || !signature) {
        return false;
    }

    const expected = crypto
        .createHmac(algorithm, secret)
        .update(payload ?? rawBody, 'utf8')
        .digest(digest);
    const received = prefix && signature.startsWith(prefix) ? signature.slice(prefix.length) : signature;

    return safeCompare(expected, received, digest === 'hex' ? 'hex' : 'base64');
}

export interface SvixOptions {
    secret: string;
    headers: Record<string, any>;
    rawBody: string;
    toleranceSeconds?: number;
}

export type SvixResult = 'valid' | 'invalid' | 'missing_headers' | 'stale_timestamp';

/**
 * Verify a signature following the standard-webhooks (Svix) scheme, used as-is by
 * GitLab, Fathom and Folk.
 *
 * Signed content is `{webhook-id}.{webhook-timestamp}.{rawBody}`, the secret is a
 * base64 key optionally prefixed with `whsec_`, and `webhook-signature` carries one
 * or more space separated `v1,<base64>` signatures.
 *
 * https://www.standardwebhooks.com/
 */
export function validateSvixSignature({ secret, headers, rawBody, toleranceSeconds = DEFAULT_TOLERANCE_SECONDS }: SvixOptions): SvixResult {
    const msgId = headers['webhook-id'] || headers['svix-id'];
    const msgTimestamp = headers['webhook-timestamp'] || headers['svix-timestamp'];
    const msgSignature = headers['webhook-signature'] || headers['svix-signature'];

    if (!msgId || !msgTimestamp || !msgSignature || !secret) {
        return 'missing_headers';
    }

    if (!isFreshTimestamp(msgTimestamp, toleranceSeconds)) {
        return 'stale_timestamp';
    }

    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    if (key.length < MIN_KEY_BYTES) {
        return 'invalid';
    }

    // The sender signed the header text, so sign that rather than the parsed number. Number()
    // normalises away leading zeros, whitespace and a trailing .0, which would rebuild a different
    // payload and reject an otherwise valid signature.
    const expected = crypto
        .createHmac('sha256', key)
        .update(`${msgId}.${String(msgTimestamp)}.${rawBody}`)
        .digest('base64');

    const matched = String(msgSignature)
        .split(' ')
        .map((sig) => sig.replace(/^v1,/, ''))
        .some((sig) => safeCompare(expected, sig, 'base64'));

    return matched ? 'valid' : 'invalid';
}
