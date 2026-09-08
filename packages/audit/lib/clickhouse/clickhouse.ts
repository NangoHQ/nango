import { createClient } from '@clickhouse/client';

import type { ClickHouseClient } from '@clickhouse/client';

// Dedicated audit database, created and migrated by this package's own runner.
export const AUDIT_DATABASE = 'audit';

// A dashboard query has nothing to retry, so reads wait out a suspended dev/staging instance waking up.
// A write must instead finish inside the queue's visibility timeout, so its caller passes a shorter one.
const READ_REQUEST_TIMEOUT_MS = 60_000;

// Pass null to connect without a database, which is what lets the migration runner CREATE DATABASE.
export function auditClickhouseClient(
    clickhouseUrl: string,
    { database = AUDIT_DATABASE, requestTimeoutMs = READ_REQUEST_TIMEOUT_MS }: { database?: string | null; requestTimeoutMs?: number } = {}
): ClickHouseClient {
    return createClient({
        url: clickhouseUrl,
        ...(database ? { database } : {}),
        request_timeout: requestTimeoutMs
    });
}
