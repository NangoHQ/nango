import type { ApiEndpoint, ApiError } from '../api.js';
import type {
    AuditAction,
    AuditActor,
    AuditContext,
    AuditOutcome,
    AuditPolicy,
    AuditResource,
    AuditScope,
    AuditTarget,
    AuditTrailVersion,
    AuditVia
} from './event.js';

// The audit event returned to the dashboard — the stored blob, parsed. Typed strictly for the current
// schema `version` (a literal discriminant). At a breaking version this becomes a `version`-discriminated
// union (or transform-to-latest on read) with runtime validation, deferred to the contract-versioning
// work. `metadata` stays loose until then.
export interface ApiAuditTrailEvent {
    id: string;
    version: AuditTrailVersion;
    occurredAt: string;
    accountId: number;
    scope: AuditScope;
    environment: { id: number; display: string } | null;
    actor: AuditActor;
    via?: AuditVia[];
    targets: AuditTarget[];
    context: AuditContext;
    outcome: AuditOutcome;
    resource: AuditResource;
    action: AuditAction;
    metadata?: Record<string, unknown>;
}

export type GetAuditTrail = ApiEndpoint<{
    Audit: AuditPolicy<'audit_trail', 'queried', 'account'>;
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
        // Opt-in: the count is a second read, so a caller that doesn't show one shouldn't pay for it.
        showTotal?: boolean | undefined;
    };
    Success: {
        data: ApiAuditTrailEvent[];
        total?: AuditTrailTotal;
        pagination: { nextCursor: string | null };
    };
}>;

/**
 * How many events the filters match, not how many the page holds. Absent unless `showTotal` was
 * asked for, and when the count failed.
 *
 * The read is bounded, so `relation` says whether `value` is the answer or a floor — `gte` means the
 * account has at least this many and the count stopped looking. Shaped after Elasticsearch's `hits.total`
 * so a caller cannot read the number without seeing which it is.
 */
export interface AuditTrailTotal {
    value: number;
    relation: 'eq' | 'gte';
}

// A type rather than a value: this package ships `typings` only, so neither side can import a constant from
// it. Both copies annotate themselves with this, which makes drift a compile error.
export type AuditExportMaxRows = 50_000;

export type GetAuditTrailExport = ApiEndpoint<{
    Audit: AuditPolicy<'audit_trail', 'exported', 'account'>;
    Method: 'GET';
    Path: '/api/v1/audit-trail/export';
    Error: ApiError<'feature_disabled'>;
    Querystring: {
        from?: string;
        to?: string;
        resources?: string;
        actions?: string;
    };
    // A CSV attachment, written straight to the response, as the other download endpoints do.
    Success: never;
}>;
