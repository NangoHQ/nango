import { HOSTED_TELEMETRY_SCHEMA, HOSTED_TELEMETRY_TABLE } from './schema.js';

import type { MetricRow } from '../exporter.js';
import type { Knex } from 'knex';

const PAGE_SIZE = 10_000;

/**
 * The rows with `from <= ts < to`, in primary key order, one page at a time. A range of any size is read without
 * holding it in memory or keeping a cursor open: the last row of a page is where the next one starts.
 */
export async function* readMetricPages(
    knex: Knex,
    { from, to, schema = HOSTED_TELEMETRY_SCHEMA }: { from: Date; to: Date; schema?: string }
): AsyncGenerator<MetricRow[]> {
    let last: MetricRow | undefined;
    for (;;) {
        const { rows } = await knex.raw<{ rows: MetricRow[] }>(
            `SELECT ts, metric, attributes, value FROM ??.??
             WHERE ts >= ?::timestamptz AND ts < ?::timestamptz
             ${last ? 'AND (metric, ts, attributes) > (?, ?::timestamptz, ?::jsonb)' : ''}
             ORDER BY metric, ts, attributes
             LIMIT ?`,
            [
                schema,
                HOSTED_TELEMETRY_TABLE,
                from.toISOString(),
                to.toISOString(),
                ...(last ? [last.metric, last.ts.toISOString(), JSON.stringify(last.attributes)] : []),
                PAGE_SIZE
            ]
        );
        if (rows.length > 0) {
            yield rows;
        }
        last = rows.at(-1);
        if (!last || rows.length < PAGE_SIZE) {
            return;
        }
    }
}
