import { createClient } from '@clickhouse/client';

import type { ClickHouseClient } from '@clickhouse/client';

export function auditClickhouseClient(clickhouseUrl: string): ClickHouseClient {
    return createClient({
        url: clickhouseUrl,
        database: 'usage',
        request_timeout: 60_000 // CH Cloud auto-suspend wake-up can exceed the 30s default
    });
}
