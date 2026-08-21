import type { RequestLocals } from './express.js';
import type { AnyAuditPolicy, AppAuthClaim, AuditClaimOf, AuditPolicy, ConnectionAuthClaim, ConnectionCreateAudit } from '@nangohq/types';
import type { Response } from 'express';

declare const claimed: unique symbol;

// Merged, not replaced: an auth route learns whether it authenticated in one place and whether it was a
// first sign-in in another, so two calls contribute to one claim.
function mergeClaim(res: Response<any, RequestLocals>, claim: unknown): void {
    res.locals.auditClaim = { ...(res.locals.auditClaim as object | undefined), ...(claim as object) };
}

/** A success body that carries its audit claim. Only `claimAudit` can produce one. */
export type Claimed<TBody> = TBody & { readonly [claimed]: true };

interface AuditedEndpoint {
    Success: unknown;
    Audit: AnyAuditPolicy;
}

/**
 * Call it at the send, not where the fact first becomes known: a connection rejected by validate-connection is
 * hard-deleted, so claiming any earlier records a creation that no longer exists. The type enforces that a
 * claim is made, never where.
 */
export function claimAudit<TEndpoint extends AuditedEndpoint>(
    res: Response<any, RequestLocals>,
    body: TEndpoint['Success'],
    claim: AuditClaimOf<TEndpoint>
): Claimed<TEndpoint['Success']> {
    mergeClaim(res, claim);
    return body as Claimed<TEndpoint['Success']>;
}

/** For a response with no body to brand — a redirect, or HTML — so nothing forces the call. */
function claimUnbranded<TEndpoint extends AuditedEndpoint>(res: Response<any, any>, claim: AuditClaimOf<TEndpoint>): void {
    // These routes are typed `Response<any, any>`, so the locals are narrowed here rather than at the call.
    mergeClaim(res as Response<any, RequestLocals>, claim);
}

/**
 * One request can upsert twice — a CUSTOM OAuth install creates, then overrides — and the second report must
 * not turn the row into a re-authorization. Creation is sticky for that reason.
 */
export function claimConnectionUpsert(res: Response<any, any>, claim: ConnectionAuthClaim): void {
    const existing = (res.locals as RequestLocals).auditClaim as ConnectionAuthClaim | undefined;
    claimUnbranded<ConnectionCreateAudit>(res, existing?.operation === 'creation' ? { ...claim, operation: 'creation' } : claim);
}

export function claimAppAuth(res: Response<any, any>, claim: AppAuthClaim): void {
    claimUnbranded<{ Success: unknown; Audit: AuditPolicy<'app_auth', 'login' | 'signup', 'account', AppAuthClaim> }>(res, claim);
}
