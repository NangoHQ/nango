import type { ApiEndpoint } from '../api.js';
import type { AuditAction, AuditActor, AuditContext, AuditOutcome, AuditResource, AuditTarget, AuditTrailVersion } from './event.js';

// The audit event returned to the dashboard — the stored blob, parsed. Typed strictly for the current
// schema `version` (a literal discriminant). At a breaking version this becomes a `version`-discriminated
// union (or transform-to-latest on read) with runtime validation, deferred to the contract-versioning
// work. `metadata` stays loose until then.
export interface ApiAuditTrailEvent {
    id: string;
    version: AuditTrailVersion;
    occurredAt: string;
    accountId: number;
    environment: { id: number; display: string } | null;
    actor: AuditActor;
    via?: AuditActor[];
    targets: AuditTarget[];
    context: AuditContext;
    outcome: AuditOutcome;
    resource: AuditResource;
    action: AuditAction;
    metadata?: Record<string, unknown>;
}

export type GetAuditTrail = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/audit-trail';
    Querystring: {
        // Account-scoped endpoint: no `env`. `cursor` encodes position only, not the filter window — resend
        // every other param on each page or subsequent pages paginate the unfiltered set past the cursor.
        cursor?: string;
        from?: string;
        to?: string;
        // Comma-separated `AuditResource` / `AuditAction` values (`?resources=connection,sync`).
        // `actions` requires `resources`: the pair is matched as one `resource.action` value.
        resources?: string;
        actions?: string;
    };
    Success: {
        data: ApiAuditTrailEvent[];
        pagination: { nextCursor: string | null };
    };
}>;
