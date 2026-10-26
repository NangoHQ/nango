import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose';

import { INTERNAL_SERVICE_ISSUER_JOBS } from '../nango/principals.js';
import { TASK_CAPABILITY_SCOPES } from '../nango/scopes.js';

import type { InternalServiceAuth, TaskCapabilityResource } from '../nango/principals.js';
import type { TaskCapabilityScope } from '../nango/scopes.js';
import type { KeyRegistry } from './registry.js';
import type { CryptoKey } from 'jose';

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

export interface UnifiedVerifyResult {
    auth: InternalServiceAuth | null;
    /**
     * True when the header carries a `kid`. A failed kid token selected a key and must not be
     * retried against a verifier that ignores `kid`.
     */
    kidBound: boolean;
}

/**
 * Verify a `kid` EdDSA token against the registry.
 * `kidBound` is false only when the token has no key id, so a caller may try the legacy kid-less verifier.
 * Callers must not fall through to the static secret when this returns no auth.
 */
export async function verify(token: string, audience: string, registry: KeyRegistry): Promise<UnifiedVerifyResult> {
    let kid: string;
    try {
        const header = decodeProtectedHeader(token);
        if (header.alg !== 'EdDSA' || header.typ !== 'JWT' || typeof header.kid !== 'string' || header.kid.length === 0) {
            return { auth: null, kidBound: false };
        }
        kid = header.kid;
    } catch {
        return { auth: null, kidBound: false };
    }

    const entry = registry[kid];
    if (!entry) {
        return { auth: null, kidBound: true };
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
            return { auth: null, kidBound: true };
        }
        const res = readResource(payload['res']);
        if (res === 'invalid') {
            return { auth: null, kidBound: true };
        }
        const scopes = readScopes(payload['scopes']);
        if (scopes === 'invalid') {
            return { auth: null, kidBound: true };
        }
        return {
            auth: {
                kind: 'jwt',
                subject: payload.sub,
                sub: payload.sub,
                issuer: entry.iss,
                audience,
                ...(res ? { res } : {}),
                ...(scopes ? { scopes } : {})
            },
            kidBound: true
        };
    } catch {
        return { auth: null, kidBound: true };
    }
}

export type TaskCapabilityAuth = InternalServiceAuth & {
    kind: 'jwt';
    sub: string;
    res: TaskCapabilityResource;
    scopes: readonly TaskCapabilityScope[];
};

/**
 * Verify a task capability token for one audience. The caller builds `registry` once and passes it in.
 * Returns null unless the token is an Ed25519 jobs task JWT with a valid `res` and at least one known scope.
 */
export async function verifyTaskCapabilityToken(token: string, audience: string, registry: KeyRegistry): Promise<TaskCapabilityAuth | null> {
    const { auth } = await verify(token, audience, registry);
    if (!auth?.res || !auth.scopes || auth.scopes.length === 0 || auth.issuer !== INTERNAL_SERVICE_ISSUER_JOBS || !isTaskSubject(auth.sub)) {
        return null;
    }
    return { ...auth, kind: 'jwt', sub: auth.sub, res: auth.res, scopes: auth.scopes };
}

const CAPABILITY_SCOPE_VALUES: ReadonlySet<string> = new Set(TASK_CAPABILITY_SCOPES);

function isTaskSubject(sub: string | undefined): sub is string {
    return typeof sub === 'string' && sub.startsWith('task:') && sub.length > 'task:'.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function readResource(value: unknown): TaskCapabilityResource | null | 'invalid' {
    if (value === undefined) {
        return null;
    }
    if (!isRecord(value) || !isPositiveInt(value['environmentId']) || !isPositiveInt(value['connectionId'])) {
        return 'invalid';
    }
    const syncId = value['syncId'];
    if (syncId !== undefined && (typeof syncId !== 'string' || syncId.length === 0)) {
        return 'invalid';
    }
    const res: TaskCapabilityResource = { environmentId: value['environmentId'], connectionId: value['connectionId'] };
    if (typeof syncId === 'string') {
        res.syncId = syncId;
    }
    return res;
}

function isCapabilityScope(value: unknown): value is TaskCapabilityScope {
    return typeof value === 'string' && CAPABILITY_SCOPE_VALUES.has(value);
}

function readScopes(value: unknown): TaskCapabilityScope[] | null | 'invalid' {
    if (value === undefined) {
        return null;
    }
    if (!Array.isArray(value)) {
        return 'invalid';
    }
    const scopes: TaskCapabilityScope[] = [];
    for (const entry of value) {
        if (typeof entry !== 'string' || entry.length === 0) {
            return 'invalid';
        }
        if (isCapabilityScope(entry)) {
            scopes.push(entry);
        }
    }
    return scopes;
}
