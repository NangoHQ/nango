import { createHmac, timingSafeEqual } from 'node:crypto';

import { INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS, INTERNAL_SERVICE_TOKEN_ISSUER } from './constants.js';
import { getInternalAuthSigningKey } from './credential.js';

import type { InternalServiceAuth } from './constants.js';
import type { EnvRecord } from './credential.js';

export interface CreateInternalServiceTokenArgs {
    audience?: string;
    taskId: string;
    expiresInSecs?: number;
    issuedAt?: number;
}

function base64UrlEncode(value: string | Buffer): string {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return buf.toString('base64url');
}

function base64UrlDecode(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
}

export function isJwtShape(token: string): boolean {
    const parts = token.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
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
 * Mint a task-bound HMAC JWT. Returns null when the signing key is unset so invoke stays a no-op.
 */
export function createInternalServiceToken(args: CreateInternalServiceTokenArgs, env: EnvRecord = process.env): string | null {
    const key = getInternalAuthSigningKey(env);
    if (!key) {
        return null;
    }

    const iat = args.issuedAt ?? Math.floor(Date.now() / 1000);
    const exp = iat + (args.expiresInSecs ?? INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS);
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64UrlEncode(
        JSON.stringify({
            iss: INTERNAL_SERVICE_TOKEN_ISSUER,
            aud: args.audience ?? INTERNAL_SERVICE_AUDIENCE_JOBS,
            task_id: args.taskId,
            iat,
            exp
        })
    );
    const signingInput = `${header}.${payload}`;
    return `${signingInput}.${signHs256(signingInput, key)}`;
}

export function verifyInternalServiceToken(token: string, audience: string, env: EnvRecord = process.env): InternalServiceAuth | null {
    const key = getInternalAuthSigningKey(env);
    if (!key || !isJwtShape(token)) {
        return null;
    }

    const [headerPart, payloadPart, signature] = token.split('.');
    if (!headerPart || !payloadPart || !signature) {
        return null;
    }

    const signingInput = `${headerPart}.${payloadPart}`;
    const expected = signHs256(signingInput, key);
    if (!signaturesMatch(signature, expected)) {
        return null;
    }

    let payload: { iss?: unknown; aud?: unknown; task_id?: unknown; exp?: unknown };
    try {
        payload = JSON.parse(base64UrlDecode(payloadPart)) as typeof payload;
    } catch {
        return null;
    }

    if (payload.iss !== INTERNAL_SERVICE_TOKEN_ISSUER) {
        return null;
    }
    if (payload.aud !== audience) {
        return null;
    }
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
        return null;
    }
    if (typeof payload.task_id !== 'string' || payload.task_id.length === 0) {
        return null;
    }

    return {
        kind: 'hmac',
        subject: INTERNAL_SERVICE_TOKEN_ISSUER,
        audience,
        taskId: payload.task_id
    };
}
