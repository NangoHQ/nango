import { createHmac, sign, timingSafeEqual, verify } from 'node:crypto';

import {
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    INTERNAL_SERVICE_AUDIENCE_RUNNER,
    INTERNAL_SERVICE_TOKEN_DEFAULT_EXPIRES_SECS,
    INTERNAL_SERVICE_TOKEN_ISSUER
} from './constants.js';
import { trimOrNull } from './credential.js';
import { deriveRunnerEd25519PrivateKey, runnerPublicKeyFromEnv } from './ed25519.js';

import type { InternalServiceAuth, InternalServiceAuthKind, InternalServiceTokenOp } from './constants.js';

type CreateInternalServiceTokenBase = {
    audience?: string;
    expiresInSecs?: number;
    issuedAt?: number;
};

export type CreateInternalServiceTokenArgs = CreateInternalServiceTokenBase & ({ op?: 'task'; taskId: string } | { op: 'node'; nodeId: string });

const TOKEN_OPS: ReadonlySet<string> = new Set(['task', 'node']);

function base64UrlEncode(value: string | Buffer): string {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return buf.toString('base64url');
}

function base64UrlDecode(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
}

/** JWT base64url (RFC 7515): A-Za-z0-9_- only, no padding. Node's decoder silently drops other chars. */
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function decodeBase64UrlStrict(value: string): Buffer | null {
    if (!BASE64URL_RE.test(value)) {
        return null;
    }
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.length === 0 || decoded.toString('base64url') !== value) {
        return null;
    }
    return decoded;
}

export function isJwtShape(token: string): boolean {
    const parts = token.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
}

export function jwtHeaderAlg(token: string): string | null {
    if (!isJwtShape(token)) {
        return null;
    }
    const headerPart = token.split('.')[0];
    if (!headerPart) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(base64UrlDecode(headerPart));
        if (!parsed || typeof parsed !== 'object' || !('alg' in parsed) || typeof parsed.alg !== 'string') {
            return null;
        }
        return parsed.alg;
    } catch {
        return null;
    }
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

function tokenPayload(args: CreateInternalServiceTokenArgs, iat: number, exp: number): Record<string, string | number> {
    const aud = args.audience ?? INTERNAL_SERVICE_AUDIENCE_JOBS;
    const base = { iss: INTERNAL_SERVICE_TOKEN_ISSUER, aud, iat, exp };
    if ('nodeId' in args) {
        return { ...base, op: args.op, node_id: args.nodeId };
    }
    return { ...base, op: 'task', task_id: args.taskId };
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

export type InternalAuthFailure = 'not_jwt' | 'no_signing_key' | 'bad_signature' | 'expired' | 'wrong_audience' | 'malformed_claims';

export type VerifyInternalServiceTokenResult = ({ ok: true } & InternalServiceAuth) | { ok: false; reason: InternalAuthFailure };

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

function authFromPayload(payloadPart: string, audience: string, kind: InternalServiceAuthKind): VerifyInternalServiceTokenResult {
    let payload: { iss?: unknown; aud?: unknown; op?: unknown; task_id?: unknown; node_id?: unknown; exp?: unknown };
    try {
        const parsed: unknown = JSON.parse(base64UrlDecode(payloadPart));
        if (!parsed || typeof parsed !== 'object') {
            return { ok: false, reason: 'malformed_claims' };
        }
        payload = parsed as typeof payload;
    } catch {
        return { ok: false, reason: 'malformed_claims' };
    }

    if (payload.iss !== INTERNAL_SERVICE_TOKEN_ISSUER) {
        return { ok: false, reason: 'malformed_claims' };
    }
    if (payload.aud !== audience) {
        return { ok: false, reason: 'wrong_audience' };
    }
    if (typeof payload.exp !== 'number') {
        return { ok: false, reason: 'malformed_claims' };
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
        return { ok: false, reason: 'expired' };
    }
    if (typeof payload.op !== 'string' || !TOKEN_OPS.has(payload.op)) {
        return { ok: false, reason: 'malformed_claims' };
    }
    const op = payload.op as InternalServiceTokenOp;

    if (op === 'task') {
        if (typeof payload.task_id !== 'string' || payload.task_id.length === 0) {
            return { ok: false, reason: 'malformed_claims' };
        }
        return {
            ok: true,
            kind,
            subject: INTERNAL_SERVICE_TOKEN_ISSUER,
            audience,
            op,
            taskId: payload.task_id
        };
    }

    if (typeof payload.node_id !== 'string' || payload.node_id.length === 0) {
        return { ok: false, reason: 'malformed_claims' };
    }
    return {
        ok: true,
        kind,
        subject: INTERNAL_SERVICE_TOKEN_ISSUER,
        audience,
        op,
        nodeId: payload.node_id
    };
}
