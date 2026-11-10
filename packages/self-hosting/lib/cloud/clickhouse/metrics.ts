import tracer from 'dd-trace';

import { Err, metrics, Ok } from '@nangohq/utils';

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
    return await tracer.trace('nango.self_hosting.clickhouse.insert', async (span) => {
        span?.addTags({ 'nango.installationId': installationId, rows: rows.length });
        const start = process.hrtime.bigint();
        const observe = (success: boolean) =>
            metrics.distribution(metrics.Types.SELF_HOSTING_CLICKHOUSE_INSERT_DURATION_MS, Number(process.hrtime.bigint() - start) / 1e6, {
                success: String(success)
            });
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
            observe(true);
            metrics.distribution(metrics.Types.SELF_HOSTING_CLICKHOUSE_INSERT_ROWS, rows.length);
            return Ok(undefined);
        } catch (err) {
            observe(false);
            span?.setTag('error', err);
            return Err(err);
        }
    });
}
