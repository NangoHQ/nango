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
        ...(opts?.database ? { database: opts.database } : {})
    });
}
