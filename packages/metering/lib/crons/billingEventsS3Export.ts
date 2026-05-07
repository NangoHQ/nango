import tracer from 'dd-trace';
import * as cron from 'node-cron';

import { getLocking } from '@nangohq/kvstore';
import { clickhouseClient } from '@nangohq/usage';
import { getLogger } from '@nangohq/utils';

import { envs } from '../env.js';

import type { Lock } from '@nangohq/kvstore';

const logger = getLogger('cron.billingEventsS3Export');
const cronMinutes = envs.CRON_BILLING_EVENTS_S3_EXPORT_MINUTES;
const bucket = envs.BILLING_EVENTS_S3_BUCKET;
const roleArn = envs.BILLING_EVENTS_S3_WRITER_ROLE_ARN;
const eventNameSuffix = envs.BILLING_EVENTS_S3_EVENT_NAME_SUFFIX;

const LOCK_KEY = 'lock:cron:billingEventsS3Export';
const LOCK_TTL_MS_CAP = 30 * 60 * 1000; // hard cap; the export query is seconds, no reason to hold a lock for hours
const lockTtlMs = Math.min(cronMinutes * 60 * 1000 * 0.8, LOCK_TTL_MS_CAP);

const DEFAULT_DATABASE = 'usage';

export interface MetricSpec {
    /** Canonical Orb event_name; the suffix is appended at SQL gen time. */
    canonicalEventName: string;
    /**
     * SQL fragment that produces rows shaped:
     *   account_id, day, count, [extra_property_columns...]
     * for the chosen day, GROUPed BY (account_id, day).
     */
    select: (day: string, database: string) => string;
    /**
     * Extra `properties.*` keys beyond `count`. Each entry maps Orb property
     * name -> SQL column name produced by `select`.
     */
    extraProperties?: { propertyName: string; columnName: string }[];
}

// One row per (account, day) per event_name. Compatible Orb aggregations:
// `sum(properties.X)` and `average(properties.X)`.
//
// Not supported by this architecture:
//   - `count(events)` — Orb counts received events; we ship 1/day so it always reports 1.
//     Migrate the Orb metric to `sum(properties.count)` to get parity.
//   - `max(properties.X)` — sum and max don't commute. Summing per-slice maxStates
//     overcounts the account-level peak because slice peaks happen at different
//     timestamps. Recovering `max(account_total)` needs either a chained MV that
//     captures per-snapshot account totals before maxing, or reading raw_events at
//     export time. Today's `daily_*` MVs collapse the temporal axis and can't.
//
// Reference: https://linear.app/nango/document/orb-billable-metrics-2e0859635bc1
export const METRICS: MetricSpec[] = [
    {
        canonicalEventName: 'proxy',
        select: (day, database) => `
            SELECT account_id, day, SUM(value) AS count
            FROM ${database}.daily_proxy
            WHERE day = toDate('${day}')
            GROUP BY account_id, day
        `
    },
    {
        canonicalEventName: 'function_executions',
        select: (day, database) => `
            SELECT
                account_id, day,
                SUM(value) AS count,
                SUM(duration_ms) AS duration_ms,
                SUM(custom_logs) AS custom_logs
            FROM ${database}.daily_function_executions
            WHERE day = toDate('${day}')
            GROUP BY account_id, day
        `,
        extraProperties: [
            { propertyName: 'telemetry.durationMs', columnName: 'duration_ms' },
            { propertyName: 'telemetry.customLogs', columnName: 'custom_logs' }
        ]
    },
    {
        canonicalEventName: 'webhook_forwards',
        select: (day, database) => `
            SELECT account_id, day, SUM(value) AS count
            FROM ${database}.daily_webhook_forwards
            WHERE day = toDate('${day}')
            GROUP BY account_id, day
        `
    },
    {
        canonicalEventName: 'billable_actions',
        select: (day, database) => `
            SELECT account_id, day, SUM(value) AS count
            FROM ${database}.daily_actions
            WHERE day = toDate('${day}')
            GROUP BY account_id, day
        `
    },
    {
        canonicalEventName: 'monthly_active_records',
        select: (day, database) => `
            SELECT account_id, day, SUM(value) AS count
            FROM ${database}.daily_mar
            WHERE day = toDate('${day}')
            GROUP BY account_id, day
        `
    },
    {
        canonicalEventName: 'records',
        select: (day, database) => `
            SELECT account_id, day, ROUND(SUM(avg_val)) AS count
            FROM (
                SELECT avgMerge(value) AS avg_val, account_id, day, environment_id, integration_id, connection_id, model
                FROM ${database}.daily_records
                WHERE day = toDate('${day}')
                GROUP BY account_id, day, environment_id, integration_id, connection_id, model
            )
            GROUP BY account_id, day
        `
    },
    {
        canonicalEventName: 'billable_connections_v2',
        select: (day, database) => `
            SELECT account_id, day, ROUND(SUM(avg_val)) AS count
            FROM (
                SELECT avgMerge(value) AS avg_val, account_id, day, environment_id, integration_id
                FROM ${database}.daily_connections
                WHERE day = toDate('${day}')
                GROUP BY account_id, day, environment_id, integration_id
            )
            GROUP BY account_id, day
        `
    }
];

export function billingEventsS3ExportCron(): void {
    if (cronMinutes <= 0) {
        logger.info(`Skipping (CRON_BILLING_EVENTS_S3_EXPORT_MINUTES=${cronMinutes})`);
        return;
    }
    if (!bucket || !roleArn) {
        logger.warning(`Skipping (BILLING_EVENTS_S3_BUCKET or BILLING_EVENTS_S3_WRITER_ROLE_ARN not set)`);
        return;
    }
    if (!envs.CLICKHOUSE_URL) {
        logger.warning(`Skipping (CLICKHOUSE_URL not set)`);
        return;
    }

    cron.schedule(`*/${cronMinutes} * * * *`, () => {
        (async () => {
            await exec();
        })();
    });
}

export async function exec(): Promise<void> {
    await tracer.trace<Promise<void>>('nango.cron.billingEventsS3Export', async () => {
        logger.info(`Starting`);
        await withLock(async () => {
            const client = clickhouseClient();
            if (!client) {
                logger.error(`Clickhouse client not configured`);
                return;
            }
            try {
                const day = yesterdayUTC();
                const runTimestamp = nowCompactUTC();
                for (const metric of METRICS) {
                    const eventName = `${metric.canonicalEventName}${eventNameSuffix}`;
                    const sql = exportSql({ metric, day, runTimestamp, eventName });
                    logger.info(`Exporting ${eventName} for day=${day}`);
                    await client.command({ query: sql });
                }
                logger.info(`✅ done`);
            } catch (err) {
                logger.error('Failed to export billing events to S3', err);
            } finally {
                await client.close();
            }
        });
    });
}

async function withLock(fn: () => Promise<void>): Promise<void> {
    const locking = await getLocking();
    let lock: Lock;
    try {
        lock = await locking.acquire(LOCK_KEY, lockTtlMs);
    } catch {
        logger.info(`Could not acquire lock, skipping`);
        return;
    }
    logger.info(`Lock acquired`);
    try {
        await fn();
    } finally {
        await locking.release(lock);
    }
}

/**
 * Returns the SELECT that produces Orb-shaped rows for one metric and one day.
 * Used both as the body of the `INSERT INTO FUNCTION s3(...)` envelope at
 * production runtime, and directly by the integration test (querying it via
 * `client.query` and asserting on the rows).
 */
export function metricRowsSql({
    metric,
    day,
    eventName,
    database = DEFAULT_DATABASE
}: {
    metric: MetricSpec;
    day: string;
    eventName: string;
    database?: string;
}): string {
    const propertyEntries = [`'count', toString(count)`, ...(metric.extraProperties ?? []).map((p) => `'${p.propertyName}', toString(${p.columnName})`)];

    return `
        SELECT
            concat('${eventName}:', toString(account_id), ':', toString(day)) AS idempotency_key,
            '${eventName}' AS event_name,
            toString(account_id) AS external_customer_id,
            concat(toString(day), 'T00:00:00.000Z') AS timestamp,
            map(${propertyEntries.join(', ')}) AS properties
        FROM (${metric.select(day, database)})
    `;
}

function exportSql({ metric, day, runTimestamp, eventName }: { metric: MetricSpec; day: string; runTimestamp: string; eventName: string }): string {
    const dayCompact = day.replace(/-/g, '');
    const url = `https://${bucket}.s3.amazonaws.com/${dayCompact}/${runTimestamp}_${eventName}.jsonl`;

    return `
        INSERT INTO FUNCTION s3(
            '${url}',
            extra_credentials(role_arn = '${roleArn}'),
            'JSONEachRow'
        )
        ${metricRowsSql({ metric, day, eventName })}
    `;
}

function yesterdayUTC(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function nowCompactUTC(): string {
    return new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z'); // YYYYMMDDTHHMMSSZ
}
