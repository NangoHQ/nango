import { createClient } from '@clickhouse/client';

import type { ClickHouseClient } from '@clickhouse/client';

// Dedicated audit database, created and migrated by this package's own runner.
export const AUDIT_DATABASE = 'audit';

export function auditClickhouseClient(clickhouseUrl: string, opts?: { database: string }): ClickHouseClient {
    return createClient({
        url: clickhouseUrl,
        ...(opts?.database ? { database: opts.database } : {}),
        request_timeout: 60_000 // CH Cloud auto-suspend wake-up can exceed the 30s default
    });
}
