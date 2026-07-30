import { createClient } from '@clickhouse/client';

import type { ClickHouseClient } from '@clickhouse/client';

// Dedicated audit database, created and migrated by this package's own runner.
export const AUDIT_DATABASE = 'audit';

// TODO: default to AUDIT_DATABASE once it and its schema are created.
// Defaults to where audit_trail_events lives today, so callers that don't care keep hitting it. Pass
// null to connect without a database, which is what lets the migration runner CREATE DATABASE.
export function auditClickhouseClient(clickhouseUrl: string, { database = 'usage' }: { database?: string | null } = {}): ClickHouseClient {
    return createClient({
        url: clickhouseUrl,
        ...(database ? { database } : {}),
        request_timeout: 60_000 // CH Cloud auto-suspend wake-up can exceed the 30s default
    });
}
