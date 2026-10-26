import { INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_TOKEN_ISSUER } from '../nango/principals.js';

import type { InternalServiceAuth, InternalServiceAuthKind, InternalServiceTokenOp } from '../nango/principals.js';

type CreateInternalServiceTokenBase = {
    audience?: string;
    expiresInSecs?: number;
    issuedAt?: number;
};

export type CreateInternalServiceTokenArgs = CreateInternalServiceTokenBase & ({ op?: 'task'; taskId: string } | { op: 'node'; nodeId: string });

const TOKEN_OPS: ReadonlySet<string> = new Set(['task', 'node']);

export function base64UrlEncode(value: string | Buffer): string {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return buf.toString('base64url');
}

export function base64UrlDecode(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
}

/** JWT base64url (RFC 7515): A-Za-z0-9_- only, no padding. Node's decoder silently drops other chars. */
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export function decodeBase64UrlStrict(value: string): Buffer | null {
    if (!BASE64URL_RE.test(value)) {
        return null;
    }
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.length === 0 || decoded.toString('base64url') !== value) {
        return null;
    }
    return decoded;
}

export function tokenPayload(args: CreateInternalServiceTokenArgs, iat: number, exp: number): Record<string, string | number> {
    const aud = args.audience ?? INTERNAL_SERVICE_AUDIENCE_JOBS;
    const base = { iss: INTERNAL_SERVICE_TOKEN_ISSUER, aud, iat, exp };
    if ('nodeId' in args) {
        return { ...base, op: args.op, node_id: args.nodeId };
    }
    return { ...base, op: 'task', task_id: args.taskId };
}

export type InternalAuthFailure = 'not_jwt' | 'no_signing_key' | 'bad_signature' | 'expired' | 'wrong_audience' | 'malformed_claims';

export type VerifyInternalServiceTokenResult = ({ ok: true } & InternalServiceAuth) | { ok: false; reason: InternalAuthFailure };

export function authFromPayload(payloadPart: string, audience: string, kind: InternalServiceAuthKind): VerifyInternalServiceTokenResult {
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
