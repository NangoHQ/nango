import type { AuditPolicy } from '@nangohq/types';
import type { RequestHandler } from 'express';

// POC — structural audit-wiring checks.
//
// The audit event's identity is decided at compile time (every typed endpoint declares
// `Audit: AuditPolicy | NoAudit`). What the compiler cannot see is whether the middleware that
// services that decision is actually installed on the route, and in the right position. These
// markers + walkers let a plain unit test assert that invariant against the built router table —
// no server, no database, no HTTP.

// Tag markers. Symbols are module-singletons, so the same symbol is shared across every importer.
export const AUDIT_POLICY = Symbol('nango.audit.policy');
export const IS_AUTHZ = Symbol('nango.authz');

export function markAudit(handler: RequestHandler, policy: AuditPolicy): RequestHandler {
    (handler as unknown as Record<symbol, unknown>)[AUDIT_POLICY] = policy;
    return handler;
}

export function markAuthz(handler: RequestHandler): RequestHandler {
    (handler as unknown as Record<symbol, unknown>)[IS_AUTHZ] = true;
    return handler;
}

function auditPolicyOf(handler: unknown): AuditPolicy | undefined {
    return (handler as Record<symbol, AuditPolicy | undefined>)?.[AUDIT_POLICY];
}

function isAuthz(handler: unknown): boolean {
    return Boolean((handler as Record<symbol, unknown>)?.[IS_AUTHZ]);
}

export interface RouteHandlers {
    method: string;
    path: string;
    handlers: RequestHandler[];
}

// Walk an Express Router's layer stack into an ordered handler list per (method, path).
export function collectRoutes(router: { stack?: unknown[] }): RouteHandlers[] {
    const out: RouteHandlers[] = [];
    for (const layer of router.stack ?? []) {
        const route = (layer as { route?: { path: string; methods?: Record<string, boolean>; stack?: { handle: RequestHandler }[] } }).route;
        if (!route) {
            continue;
        }
        const handlers = (route.stack ?? []).map((l) => l.handle);
        for (const method of Object.keys(route.methods ?? {})) {
            out.push({ method: method.toUpperCase(), path: route.path, handlers });
        }
    }
    return out;
}

// Positional invariant: an installed audit handler must sit AFTER auth (so res.locals is populated)
// and BEFORE authorization (so 4xx denials are still captured). Returns a human-readable violation
// per offending route.
export function auditPositionViolations(routes: RouteHandlers[], authHandlers: Set<RequestHandler>): string[] {
    const violations: string[] = [];
    for (const { method, path, handlers } of routes) {
        const auditIdx = handlers.findIndex((h) => auditPolicyOf(h));
        if (auditIdx === -1) {
            continue;
        }
        const authIdxs = handlers.map((h, i) => (authHandlers.has(h) ? i : -1)).filter((i) => i >= 0);
        const authzIdxs = handlers.map((h, i) => (isAuthz(h) ? i : -1)).filter((i) => i >= 0);
        if (authIdxs.length > 0 && auditIdx < Math.max(...authIdxs)) {
            violations.push(`${method} ${path}: audit middleware runs before auth (res.locals not populated yet)`);
        }
        if (authzIdxs.length > 0 && auditIdx > Math.min(...authzIdxs)) {
            violations.push(`${method} ${path}: audit middleware runs after authorization — denied (4xx) requests will not be recorded`);
        }
    }
    return violations;
}

// Presence invariant (partial): every defined audit spec must be wired to at least one route.
// Catches "spec written but never installed". It cannot catch "endpoint opted in via its type but no
// spec was ever written" — that gap needs the policy to be a runtime value (the typed route builder).
export function unwiredAuditSpecs(routes: RouteHandlers[], specs: Record<string, unknown>): string[] {
    const installed = new Set(routes.flatMap((r) => r.handlers).filter((h) => auditPolicyOf(h)));
    return Object.entries(specs)
        .filter(([, value]) => auditPolicyOf(value) && !installed.has(value as RequestHandler))
        .map(([name]) => name);
}
