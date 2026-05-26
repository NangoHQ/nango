import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import tracer from 'dd-trace';
import * as cron from 'node-cron';

import { getLocking } from '@nangohq/kvstore';
import { clickhouseClient } from '@nangohq/usage';
import { getLogger, metrics } from '@nangohq/utils';

import { envs } from '../env.js';

import type { Lock } from '@nangohq/kvstore';

const logger = getLogger('cron.billingEventsS3Export');
const cronMinutes = envs.CRON_BILLING_EVENTS_S3_EXPORT_MINUTES;
const bucket = envs.BILLING_EVENTS_S3_BUCKET;
const roleArn = envs.BILLING_EVENTS_S3_WRITER_ROLE_ARN;
const region = envs.BILLING_EVENTS_S3_REGION;
const eventNameSuffix = envs.BILLING_EVENTS_S3_EVENT_NAME_SUFFIX ?? '';

const LOCK_KEY = 'lock:cron:billingEventsS3Export';
const LOCK_TTL_MS_CAP = 30 * 60 * 1000; // hard cap; the export query is seconds, no reason to hold a lock for hours
const lockTtlMs = Math.min(cronMinutes * 60 * 1000 * 0.8, LOCK_TTL_MS_CAP);

// Fires every hour at :15 — the 15-min skew gives ClickHouse a buffer to ingest
// late events from the previous UTC day before we snapshot it. Each (day, metric)
// is uploaded exactly once (skip-if-exists below); later ticks on the same UTC
// day no-op, providing only self-healing if the first attempt failed.
const CRON_SCHEDULE = '15 * * * *';

const DEFAULT_DATABASE = 'usage';

export interface MetricSpec {
    /** Canonical Orb event_name; the suffix is appended at SQL gen time. */
    canonicalEventName: string;
    /**
     * SQL fragment that produces rows shaped:
     *   account_id, day, properties
     * for the chosen day, GROUPed BY (account_id, day). `properties` must be a
     * Map(String, Float64) so Orb billable metrics see numeric inputs (JSON
     * output for integer-valued Float64s renders without a trailing `.0`).
     */
    select: (day: string, database: string) => string;
}

// `count(events)` and `max(properties.X)` Orb aggregations are not supported by this
// pre-aggregated layout. See https://linear.app/nango/document/orb-billable-metrics-2e0859635bc1
export const METRICS: MetricSpec[] = [
    {
        canonicalEventName: 'proxy',
        select: (day, database) => `
            SELECT
                account_id, day,
                map('count', toFloat64(SUM(value))) AS properties
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
                map(
                    'count',                toFloat64(SUM(value)),
                    'telemetry.durationMs', toFloat64(SUM(duration_ms)),
                    'telemetry.customLogs', toFloat64(SUM(custom_logs)),
                    'telemetry.compute',    toFloat64(SUM(compute_gbms))
                ) AS properties
            FROM ${database}.daily_function_executions
            WHERE day = toDate('${day}')
            GROUP BY account_id, day
        `
    },
    {
        canonicalEventName: 'webhook_forwards',
        select: (day, database) => `
            SELECT
                account_id, day,
                map('count', toFloat64(SUM(value))) AS properties
            FROM ${database}.daily_webhook_forwards
            WHERE day = toDate('${day}')
            GROUP BY account_id, day
        `
    },
    {
        canonicalEventName: 'billable_actions',
        select: (day, database) => `
            SELECT
                account_id, day,
                map('count', toFloat64(SUM(value))) AS properties
            FROM ${database}.daily_actions
            WHERE day = toDate('${day}')
            GROUP BY account_id, day
        `
    },
    {
        canonicalEventName: 'monthly_active_records',
        select: (day, database) => `
            SELECT
                account_id, day,
                map('count', toFloat64(SUM(value))) AS properties
            FROM ${database}.daily_mar
            WHERE day = toDate('${day}')
            GROUP BY account_id, day
        `
    },
    {
        canonicalEventName: 'records',
        // Reconstruct Orb's average(count) semantic from the typed-projection MV:
        // inner: SUM across all slices (env/integration/connection/model) per (account, day, batch_id)
        //        → per-firing account total. batch_id is one UUID per metering cron firing.
        // outer: AVG across batches per (account, day)
        //        → daily average count, matching what Orb received from the legacy HTTP path.
        select: (day, database) => `
            SELECT
                account_id, day,
                map('count', toFloat64(ROUND(AVG(batch_val)))) AS properties
            FROM (
                SELECT SUM(value) AS batch_val, account_id, day, batch_id
                FROM ${database}.daily_raw_records
                WHERE day = toDate('${day}')
                GROUP BY account_id, day, batch_id
            )
            GROUP BY account_id, day
        `
    },
    {
        canonicalEventName: 'billable_connections_v2',
        // Same sum-across-slices-per-batch then average-across-batches pattern as records.
        select: (day, database) => `
            SELECT
                account_id, day,
                map('count', toFloat64(ROUND(AVG(batch_val)))) AS properties
            FROM (
                SELECT SUM(value) AS batch_val, account_id, day, batch_id
                FROM ${database}.daily_raw_connections
                WHERE day = toDate('${day}')
                GROUP BY account_id, day, batch_id
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

    cron.schedule(CRON_SCHEDULE, () => {
        exec().catch((err: unknown) => {
            logger.error('Cron tick failed unexpectedly', err);
        });
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
            const s3 = new S3Client({ region });
            const day = yesterdayUTC();
            try {
                for (const metric of METRICS) {
                    const eventName = `${metric.canonicalEventName}${eventNameSuffix}`;
                    const key = objectKey({ day, eventName });
                    const start = process.hrtime.bigint();
                    // Tracks which step is in flight so a catch can tag the failure
                    // without us having to introspect the thrown error.
                    let step: 's3_check' | 'export' = 's3_check';
                    try {
                        if (await objectExists(s3, key)) {
                            logger.info(`Skipping ${eventName} for day=${day} (already in s3://${bucket}/${key})`);
                            continue;
                        }
                        step = 'export';
                        logger.info(`Exporting ${eventName} for day=${day}`);
                        await client.command({ query: exportSql({ metric, day, eventName, key }) });
                        logger.info(`Exported ${eventName} for day=${day}`);
                        metrics.increment(metrics.Types.BILLING_USAGE_CLICKHOUSE_S3_EXPORT_RESULT, 1, { metric: metric.canonicalEventName, success: 'true' });
                    } catch (err) {
                        // Per-metric catch so a single failure (e.g. CH timeout on
                        // a heavy table) does not abort the rest of the run.
                        logger.error(`Failed to export ${eventName} for day=${day} at step=${step}`, err);
                        metrics.increment(metrics.Types.BILLING_USAGE_CLICKHOUSE_S3_EXPORT_RESULT, 1, {
                            metric: metric.canonicalEventName,
                            success: 'false',
                            step
                        });
                    } finally {
                        metrics.distribution(metrics.Types.BILLING_USAGE_CLICKHOUSE_S3_EXPORT_DURATION_MS, Number(process.hrtime.bigint() - start) / 1e6, {
                            metric: metric.canonicalEventName
                        });
                    }
                }
                logger.info(`✅ done`);
            } finally {
                await client.close();
                s3.destroy();
            }
        });
    });
}

async function objectExists(s3: S3Client, key: string): Promise<boolean> {
    try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
    } catch (err) {
        const status = (err as { $metadata?: { httpStatusCode?: number }; name?: string }).$metadata?.httpStatusCode;
        if (status === 404 || (err as Error).name === 'NotFound') {
            return false;
        }
        throw err;
    }
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
    return `
        SELECT
            concat('${eventName}:', toString(account_id), ':', toString(day)) AS idempotency_key,
            '${eventName}' AS event_name,
            toString(account_id) AS external_customer_id,
            -- End-of-day so the timestamp falls within Orb's account grace period at
            -- ingestion time (cron runs the day after, so 00:00:00 of D is older than
            -- the typical 24h grace and gets rejected with "must be later than ...").
            -- The day bucket is still D for billing purposes.
            concat(toString(day), 'T23:59:59.999Z') AS timestamp,
            properties
        FROM (${metric.select(day, database)})
    `;
}

function objectKey({ day, eventName }: { day: string; eventName: string }): string {
    const dayCompact = day.replace(/-/g, '');
    return `${dayCompact}/${eventName}.jsonl`;
}

function exportSql({ metric, day, eventName, key }: { metric: MetricSpec; day: string; eventName: string; key: string }): string {
    const url = `https://${bucket}.s3.amazonaws.com/${key}`;

    // Argument order matters: ClickHouse 25.8+ docs show s3(url, format, extra_credentials(...)).
    // Reversing the last two raises a syntax error.
    return `
        INSERT INTO FUNCTION s3(
            '${url}',
            'JSONEachRow',
            extra_credentials(role_arn = '${roleArn}')
        )
        ${metricRowsSql({ metric, day, eventName })}
    `;
}

function yesterdayUTC(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
