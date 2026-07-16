import type { Endpoint } from '../api.js';

export interface ApiAuditTrailActor {
    type: string;
    id: string;
    display?: string;
}

export interface ApiAuditTrailTarget {
    type: string;
    id: string;
    display?: string;
}

// The audit event as returned to the dashboard — the stored blob, parsed. Kept as a flat display
// shape here (resource/action are plain strings) rather than reusing @nangohq/audit's strict union.
export interface ApiAuditTrailEvent {
    id: string;
    version: string;
    occurredAt: string;
    accountId: number;
    environment: { id: number; display: string } | null;
    actor: ApiAuditTrailActor;
    via?: ApiAuditTrailActor[];
    targets: ApiAuditTrailTarget[];
    context: { ip?: string; userAgent?: string };
    outcome: string;
    resource: string;
    action: string;
    metadata?: Record<string, unknown>;
}

export type GetAuditTrail = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/audit-trail';
    Querystring: {
        env: string;
        // `cursor` encodes position only, not the filter window: resend the same `from`/`to` on every
        // page or subsequent pages paginate the unfiltered set past the cursor.
        cursor?: string;
        from?: string;
        to?: string;
    };
    Success: {
        data: ApiAuditTrailEvent[];
        pagination: { nextCursor: string | null };
    };
}>;
