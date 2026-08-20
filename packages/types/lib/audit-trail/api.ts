import type { ApiEndpoint, ApiError } from '../api.js';
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
    Error: ApiError<'feature_disabled'>;
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

// The one authoritative statement of the export ceiling. A type rather than a value because this package has
// no runtime entry point - it ships `typings` only - so neither side can import a constant from it. Both the
// server's limit and the dashboard's copy annotate themselves with this, which makes drift a compile error
// without either importing the other.
export type AuditExportMaxRows = 50_000;

export type GetAuditTrailExport = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/audit-trail/export';
    Error: ApiError<'feature_disabled'>;
    Querystring: {
        // Same filters as the list endpoint, minus `cursor`: an export walks the whole window itself.
        from?: string;
        to?: string;
        resources?: string;
        actions?: string;
    };
    // A CSV attachment rather than JSON, written straight to the response — same shape as the other
    // download endpoints.
    Success: never;
}>;
