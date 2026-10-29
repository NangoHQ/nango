import { verifyKidJwt } from '../core/verify.js';
import { taskCapabilityResourceSchema } from './mint.js';
import { INTERNAL_SERVICE_ISSUER_JOBS, INTERNAL_SERVICE_ISSUER_SERVER } from './principals.js';
import { TASK_CAPABILITY_SCOPES } from './scopes.js';

import type { KeyRegistry } from '../core/registry.js';
import type { InternalServiceAuth, TaskCapabilityResource } from './principals.js';
import type { TaskCapabilityScope } from './scopes.js';

export interface UnifiedVerifyResult {
    auth: InternalServiceAuth | null;
    /**
     * True when the header carries a `kid`. A failed kid token selected a key and must not be
     * retried against a verifier that ignores `kid`.
     */
    kidBound: boolean;
}

/**
 * Verify a `kid` EdDSA token against the registry and read task claims when they are present.
 * `kidBound` is false only when the token has no key id, so a caller may try the legacy kid-less verifier.
 * Callers must not fall through to the static secret when this returns no auth.
 */
export async function verify(token: string, audience: string, registry: KeyRegistry): Promise<UnifiedVerifyResult> {
    const verified = await verifyKidJwt(token, audience, registry);
    if (!verified.jwt) {
        return { auth: null, kidBound: verified.kidBound };
    }
    const res = readResource(verified.jwt.payload['res']);
    if (res === 'invalid') {
        return { auth: null, kidBound: true };
    }
    const scopes = readScopes(verified.jwt.payload['scopes']);
    if (scopes === 'invalid') {
        return { auth: null, kidBound: true };
    }
    if (verified.jwt.iss !== INTERNAL_SERVICE_ISSUER_JOBS && verified.jwt.iss !== INTERNAL_SERVICE_ISSUER_SERVER) {
        return { auth: null, kidBound: true };
    }
    return {
        auth: {
            kind: 'jwt',
            subject: verified.jwt.sub,
            sub: verified.jwt.sub,
            issuer: verified.jwt.iss,
            audience,
            ...(res ? { res } : {}),
            ...(scopes ? { scopes } : {})
        },
        kidBound: true
    };
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

function readResource(value: unknown): TaskCapabilityResource | null | 'invalid' {
    if (value === undefined) {
        return null;
    }
    const parsed = taskCapabilityResourceSchema.safeParse(value);
    if (!parsed.success) {
        return 'invalid';
    }
    const res: TaskCapabilityResource = { environmentId: parsed.data.environmentId, connectionId: parsed.data.connectionId };
    if (parsed.data.syncId !== undefined) {
        res.syncId = parsed.data.syncId;
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
