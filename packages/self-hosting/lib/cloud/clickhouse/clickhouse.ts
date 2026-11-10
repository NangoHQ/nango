import { createClient } from '@clickhouse/client';

import type { ClickHouseClient } from '@clickhouse/client';

export const INSTALLATIONS_DATABASE = 'installations';
export const METRICS_TABLE = 'metrics';

// A suspended dev or staging instance can take longer to wake than the client's 30s default.
const REQUEST_TIMEOUT_MS = 60_000;

/** Pass `database: null` to connect without one, which is what lets the migration runner CREATE DATABASE. */
export function installationsClickhouseClient(
    clickhouseUrl: string,
    { database = INSTALLATIONS_DATABASE }: { database?: string | null } = {}
): ClickHouseClient {
    return createClient({ url: clickhouseUrl, ...(database && { database }), request_timeout: REQUEST_TIMEOUT_MS });
}
