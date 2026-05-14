import { createClient } from '@clickhouse/client';

import { ENVS, parseEnvs } from '@nangohq/utils';

import type { ClickHouseClient } from '@clickhouse/client';

const envs = parseEnvs(ENVS);

export const database = 'usage';

export function clickhouseClient(opts?: { database: string }): ClickHouseClient | null {
    if (!envs.CLICKHOUSE_URL) {
        return null;
    }
    return createClient({
        url: envs.CLICKHOUSE_URL,
        ...(opts?.database ? { database: opts.database } : {}),
        clickhouse_settings: {
            // Block-level dedup on INSERTs to raw_events. Default is 1 for Replicated/Shared
            // engines but we set it explicitly so batcher retries that re-send a bit-identical
            // batch get short-circuited at the server before reaching storage.
            insert_deduplicate: 1,
            // Propagate the dedup decision to dependent materialized views. Without this,
            // MVs fire on every INSERT regardless of whether the parent table deduplicated
            // — which would inflate downstream daily_* aggregations on retry. Default is 0
            // in CH Cloud, so this is the load-bearing fix for retry-safety.
            deduplicate_blocks_in_dependent_materialized_views: 1
        }
    });
}
