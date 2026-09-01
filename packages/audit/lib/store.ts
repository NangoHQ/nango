import type { ApiAuditTrailEvent, SerializedAuditEvent } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export interface AuditTrailCursor {
    occurredAt: string;
    id: string;
}

export interface ListAuditTrailEventsParams {
    accountId: number;
    limit: number;
    before?: AuditTrailCursor | undefined;
    from?: string | undefined;
    to?: string | undefined;
    resources?: string[] | undefined;
    /** Narrows `resources`; ignored on its own, since a match needs both halves of `resource.action`. */
    actions?: string[] | undefined;
}

export interface AuditTrailPage {
    events: ApiAuditTrailEvent[];
    nextCursor: AuditTrailCursor | null;
}

export interface AuditWriter {
    record(record: SerializedAuditEvent): Promise<Result<void>>;
}

export interface AuditBatchWriter {
    /** `dedupToken` must be stable across retries of a batch, so a re-sent insert is discarded server-side. */
    recordMany(records: SerializedAuditEvent[], opts: { dedupToken: string }): Promise<Result<void>>;
}

export interface AuditReader {
    list(params: ListAuditTrailEventsParams): Promise<Result<AuditTrailPage>>;
}
