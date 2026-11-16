import { Err, Ok } from '@nangohq/utils';

import { METRICS_TABLE } from './clickhouse.js';

import type { ClickHouseClient } from '@clickhouse/client';
import type { Result } from '@nangohq/utils';

export interface InstallationMetricRow {
    ts: Date;
    metric: string;
    /** The attributes as the installation stores them, canonical JSON; equal rows must be byte-equal to deduplicate. */
    attributes: string;
    value: number;
}

export async function insertMetricsBatch(
    client: ClickHouseClient,
    { installationId, rows }: { installationId: string; rows: InstallationMetricRow[] }
): Promise<Result<void>> {
    if (rows.length === 0) {
        return Ok(undefined);
    }
    try {
        await client.insert({
            table: METRICS_TABLE,
            format: 'JSONEachRow',
            values: rows.map((row) => ({
                installation_id: installationId,
                ts: row.ts.getTime(),
                metric: row.metric,
                attributes: row.attributes,
                value: row.value
            }))
        });
        return Ok(undefined);
    } catch (err) {
        return Err(err);
    }
}
