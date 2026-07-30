import { createClient } from '@clickhouse/client';

import type { ClickHouseClient } from '@clickhouse/client';

// A dashboard query has nothing to retry, so reads wait out a suspended dev/staging instance waking up.
// A write must instead finish inside the queue's visibility timeout, so its caller passes a shorter one.
const READ_REQUEST_TIMEOUT_MS = 60_000;

export function auditClickhouseClient(
    clickhouseUrl: string,
    { requestTimeoutMs = READ_REQUEST_TIMEOUT_MS }: { requestTimeoutMs?: number } = {}
): ClickHouseClient {
    return createClient({
        url: clickhouseUrl,
        database: 'usage',
        request_timeout: requestTimeoutMs
    });
}
