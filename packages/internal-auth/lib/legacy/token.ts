import { createHmac, timingSafeEqual } from 'node:crypto';

import { trimOrNull } from '../nango/env.js';
import { INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS } from '../nango/principals.js';
import { authFromPayload, base64UrlDecode, base64UrlEncode, tokenPayload } from './codec.js';

import type { CreateInternalServiceTokenArgs, VerifyInternalServiceTokenResult } from './codec.js';

export type { CreateInternalServiceTokenArgs, InternalAuthFailure, VerifyInternalServiceTokenResult } from './codec.js';

export function isJwtShape(token: string): boolean {
    const parts = token.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
}

interface JwtHeader {
    alg?: string | undefined;
    kid?: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJwtHeader(token: string): JwtHeader | null {
    if (!isJwtShape(token)) {
        return null;
    }
    const [headerPart] = token.split('.');
    if (!headerPart) {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(base64UrlDecode(headerPart));
    } catch {
        return null;
    }
    if (!isRecord(parsed)) {
        return null;
    }

    const { alg, kid } = parsed;
    if (alg !== undefined && typeof alg !== 'string') {
        return null;
    }
    if (kid !== undefined && typeof kid !== 'string') {
        return null;
    }

    return { alg, kid };
}

export function jwtHeaderAlg(token: string): string | null {
    return readJwtHeader(token)?.alg ?? null;
}

function signHs256(signingInput: string, key: string): string {
    return createHmac('sha256', key).update(signingInput).digest('base64url');
}

function signaturesMatch(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) {
        return false;
    }
    return timingSafeEqual(left, right);
}

/**
 * Mint an HMAC JWT. Returns null when the signing key is unset so invoke stays a no-op.
 */
export function createInternalServiceToken(args: CreateInternalServiceTokenArgs, signingKey: string | null | undefined): string | null {
    const key = trimOrNull(signingKey ?? undefined);
    if (!key) {
        return null;
    }

    const iat = args.issuedAt ?? Math.floor(Date.now() / 1000);
    const exp = iat + (args.expiresInSecs ?? INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS);
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64UrlEncode(JSON.stringify(tokenPayload(args, iat, exp)));
    const signingInput = `${header}.${payload}`;
    return `${signingInput}.${signHs256(signingInput, key)}`;
}

export function verifyInternalServiceToken(token: string, audience: string, signingKey: string | null | undefined): VerifyInternalServiceTokenResult {
    if (!isJwtShape(token)) {
        return { ok: false, reason: 'not_jwt' };
    }

    const key = trimOrNull(signingKey ?? undefined);
    if (!key) {
        return { ok: false, reason: 'no_signing_key' };
    }

    const [headerPart, payloadPart, signature] = token.split('.');
    if (!headerPart || !payloadPart || !signature) {
        return { ok: false, reason: 'not_jwt' };
    }

    if (jwtHeaderAlg(token) !== 'HS256') {
        return { ok: false, reason: 'bad_signature' };
    }

    const signingInput = `${headerPart}.${payloadPart}`;
    const expected = signHs256(signingInput, key);
    if (!signaturesMatch(signature, expected)) {
        return { ok: false, reason: 'bad_signature' };
    }

    return authFromPayload(payloadPart, audience, 'hmac');
}
