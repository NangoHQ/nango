import { createClient } from '@clickhouse/client';

import type { ClickHouseClient } from '@clickhouse/client';

export function auditClickhouseClient({ clickhouseUrl }: { clickhouseUrl: string | undefined }): ClickHouseClient | null {
    if (!clickhouseUrl) {
        return null;
    }
    return createClient({
        url: clickhouseUrl,
        database: 'usage',
        request_timeout: 60_000 // CH Cloud auto-suspend wake-up can exceed the 30s default
    });
}
