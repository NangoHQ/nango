import { HOSTED_TELEMETRY_SCHEMA, HOSTED_TELEMETRY_TABLE } from './schema.js';

import type { MetricRow } from '../exporter.js';
import type { Knex } from 'knex';

const PAGE_SIZE = 10_000;

/**
 * A page of the rows with `from <= ts < to`, in primary key order, starting after the row `after`. Only the rows of
 * `metric` when one is given.
 */
export async function readMetricPage(
    knex: Knex,
    {
        from,
        to,
        metric,
        after,
        limit,
        schema = HOSTED_TELEMETRY_SCHEMA
    }: { from: Date; to: Date; metric?: string; after?: Pick<MetricRow, 'metric' | 'ts' | 'attributes'>; limit: number; schema?: string }
): Promise<MetricRow[]> {
    const { rows } = await knex.raw<{ rows: MetricRow[] }>(
        `SELECT ts, metric, attributes, value FROM ??.??
         WHERE ts >= ?::timestamptz AND ts < ?::timestamptz
         ${metric ? 'AND metric = ?' : ''}
         ${after ? 'AND (metric, ts, attributes) > (?, ?::timestamptz, ?::jsonb)' : ''}
         ORDER BY metric, ts, attributes
         LIMIT ?`,
        [
            schema,
            HOSTED_TELEMETRY_TABLE,
            from.toISOString(),
            to.toISOString(),
            ...(metric ? [metric] : []),
            ...(after ? [after.metric, after.ts.toISOString(), JSON.stringify(after.attributes)] : []),
            limit
        ]
    );
    return rows;
}

/**
 * The rows with `from <= ts < to`, in primary key order, one page at a time. A range of any size is read without
 * holding it in memory or keeping a cursor open: the last row of a page is where the next one starts.
 */
export async function* readMetricPages(
    knex: Knex,
    { from, to, schema = HOSTED_TELEMETRY_SCHEMA }: { from: Date; to: Date; schema?: string }
): AsyncGenerator<MetricRow[]> {
    let after: MetricRow | undefined;
    for (;;) {
        const rows = await readMetricPage(knex, { from, to, limit: PAGE_SIZE, schema, ...(after && { after }) });
        if (rows.length > 0) {
            yield rows;
        }
        after = rows.at(-1);
        if (!after || rows.length < PAGE_SIZE) {
            return;
        }
    }
}
