import { createClient } from '@clickhouse/client';

import { ENVS, parseEnvs } from '@nangohq/utils';

import type { ClickHouseClient } from '@clickhouse/client';

const envs = parseEnvs(ENVS);

// Audit rows live in the `usage` ClickHouse database (colocated), created by the metering migration.
// Null when CLICKHOUSE_URL is unset (e.g. self-host, or a server without CH access) — caller drops.
export function auditClickhouseClient(): ClickHouseClient | null {
    if (!envs.CLICKHOUSE_URL) {
        return null;
    }
    return createClient({
        url: envs.CLICKHOUSE_URL,
        database: 'usage',
        request_timeout: 60_000 // CH Cloud auto-suspend wake-up can exceed the 30s default
    });
}
