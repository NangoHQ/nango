import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import tracer from 'dd-trace';
import * as cron from 'node-cron';

import { getLocking } from '@nangohq/kvstore';
import { clickhouseClient } from '@nangohq/usage';
import { getLogger, metrics } from '@nangohq/utils';

import { envs } from '../env.js';

import type { Lock } from '@nangohq/kvstore';

const logger = getLogger('cron.billingEventsS3Export');
// Minute-of-the-hour to fire on (0–59). -1 disables the cron entirely.
// See CRON_BILLING_EVENTS_S3_HOURLY_EXPORT_MINUTE in packages/utils/lib/environment/parse.ts.
const cronMinute = envs.CRON_BILLING_EVENTS_S3_HOURLY_EXPORT_MINUTE;
const bucket = envs.BILLING_EVENTS_S3_BUCKET;
const roleArn = envs.BILLING_EVENTS_S3_WRITER_ROLE_ARN;
const region = envs.BILLING_EVENTS_S3_REGION;
const eventNameSuffix = envs.BILLING_EVENTS_S3_EVENT_NAME_SUFFIX ?? '';

const LOCK_KEY = 'lock:cron:billingEventsS3Export';
// Cron fires hourly; lock should expire well before the next tick.
const lockTtlMs = 30 * 60 * 1000;

// Single S3 client reused across cron ticks — `new S3Client()` doesn't open any
// connection eagerly so this is cheap at module load, and reusing the client lets
// the SDK pool TCP connections across runs.
const s3 = new S3Client({ region });

const DEFAULT_DATABASE = 'usage';

export interface MetricSpec {
    /** Canonical Orb event_name; the suffix is appended at SQL gen time. */
    canonicalEventName:
        | 'proxy'
        | 'function_executions'
        | 'data_transfer'
        | 'webhook_forwards'
        | 'billable_actions'
        | 'monthly_active_records'
        | 'records'
        | 'billable_connections_v2';
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
    },
    {
        canonicalEventName: 'data_transfer',
        // We only bill for egress traffic that can be labeled as DTO.
        // `count` here is the sum of all egressing bytes matching the where clause;
        // the per-package-x-callsite-pair properties break that total down into its individual contributors.
        select: (day, database) => `
            SELECT
                account_id, day,
                map(
                    'count',                     toFloat64(SUM(egressed_bytes)),
                    'server.get_/records',       toFloat64(SUMIf(egressed_bytes, package = 'server' AND callsite = 'get_/records')),
                    'server.get_/proxy',         toFloat64(SUMIf(egressed_bytes, package = 'server' AND callsite = 'get_/proxy')),
                    'server.post_/proxy',        toFloat64(SUMIf(egressed_bytes, package = 'server' AND callsite = 'post_/proxy')),
                    'server.patch_/proxy',       toFloat64(SUMIf(egressed_bytes, package = 'server' AND callsite = 'patch_/proxy')),
                    'server.put_/proxy',         toFloat64(SUMIf(egressed_bytes, package = 'server' AND callsite = 'put_/proxy')),
                    'server.delete_/proxy',      toFloat64(SUMIf(egressed_bytes, package = 'server' AND callsite = 'delete_/proxy')),
                    'server.unknown_/proxy',     toFloat64(SUMIf(egressed_bytes, package = 'server' AND callsite = 'unknown_/proxy')),
                    'server.proxy',              toFloat64(SUMIf(egressed_bytes, package = 'server' AND callsite = 'proxy')),
                    'server.webhook_forward',    toFloat64(SUMIf(egressed_bytes, package = 'server' AND callsite = 'webhook_forward')),
                    'runner.proxy',              toFloat64(SUMIf(egressed_bytes, package = 'runner' AND callsite = 'proxy')),
                    'runner.uncontrolled_fetch', toFloat64(SUMIf(egressed_bytes, package = 'runner' AND callsite = 'uncontrolled_fetch'))
                ) AS properties
            FROM ${database}.daily_data_transfer
            WHERE day = toDate('${day}')
              AND (package, callsite) IN (
                  ('server', 'get_/records'),
                  ('server', 'get_/proxy'),
                  ('server', 'proxy'),
                  ('server', 'post_/proxy'),
                  ('server', 'patch_/proxy'),
                  ('server', 'put_/proxy'),
                  ('server', 'delete_/proxy'),
                  ('server', 'unknown_/proxy'),
                  ('server', 'webhook_forward'),
                  ('runner', 'proxy'),
                  ('runner', 'uncontrolled_fetch')
              )
            GROUP BY account_id, day
        `
    }
];

export function billingEventsS3ExportCron(): void {
    if (cronMinute < 0) {
        logger.info(`Skipping (CRON_BILLING_EVENTS_S3_HOURLY_EXPORT_MINUTE=${cronMinute})`);
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

    // Hourly cron at minute `cronMinute` of every hour.
    cron.schedule(`${cronMinute} * * * *`, () => {
        exec().catch((err: unknown) => {
            logger.error('Cron tick failed unexpectedly', err);
        });
    });
}

function addEventNameSuffix(eventName: MetricSpec['canonicalEventName']): string {
    if (eventName == 'data_transfer') {
        // data_transfer is a new event and thus doesn't need the suffix to support live traffic cutoff.
        return eventName;
    }

    return `${eventName}${eventNameSuffix}`;
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
            const day = yesterdayUTC();
            let anyFailure = false;
            try {
                for (const metric of METRICS) {
                    const eventName = addEventNameSuffix(metric.canonicalEventName);
                    const key = objectKey({ day, eventName });
                    const start = process.hrtime.bigint();
                    // Tracks which step is in flight so a catch can tag the failure
                    // without us having to introspect the thrown error.
                    let step: 's3_check' | 'export' = 's3_check';
                    try {
                        if (await objectExists(key)) {
                            logger.info(`Skipping ${eventName} for day=${day} (already in s3://${bucket}/${key})`);
                            continue;
                        }
                        step = 'export';
                        logger.info(`Exporting ${eventName} for day=${day}`);
                        // ClickHouse populates `written_rows` in the X-ClickHouse-Summary
                        // response header once the multipart upload to S3 is complete
                        // (INSERT INTO FUNCTION s3(...) is atomic — the object either
                        // exists fully or not at all), so on the success path this row
                        // count matches the line count in the S3 file exactly.
                        const res = await client.command({ query: exportSql({ metric, day, eventName, key }) });
                        const writtenRows = Number(res.summary?.written_rows ?? 0);
                        logger.info(`Exported ${eventName} for day=${day} (rows=${writtenRows})`);
                        metrics.increment(metrics.Types.BILLING_USAGE_CLICKHOUSE_S3_EXPORT_FILE_RESULT, 1, {
                            metric: metric.canonicalEventName,
                            success: 'true'
                        });
                        metrics.increment(metrics.Types.BILLING_USAGE_CLICKHOUSE_S3_EXPORT_ROWS, writtenRows, {
                            metric: metric.canonicalEventName
                        });
                    } catch (err) {
                        // Per-metric catch so a single failure (e.g. CH timeout on
                        // a heavy table) does not abort the rest of the run.
                        anyFailure = true;
                        logger.error(`Failed to export ${eventName} for day=${day} at step=${step}`, err);
                        metrics.increment(metrics.Types.BILLING_USAGE_CLICKHOUSE_S3_EXPORT_FILE_RESULT, 1, {
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
                // One emit per cron tick so a monitor like
                // `sum:...run.result{success:false}.as_count() > 3` over a 3h
                // window reliably counts consecutive failed runs (cron is hourly).
                // A run is failed if any single metric failed — already-uploaded
                // skips count as success because that's the self-heal succeeding.
                metrics.increment(metrics.Types.BILLING_USAGE_CLICKHOUSE_S3_EXPORT_RUN_RESULT, 1, {
                    success: anyFailure ? 'false' : 'true'
                });
                await client.close();
            }
        });
    });
}

async function objectExists(key: string): Promise<boolean> {
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
        try {
            await locking.release(lock);
        } catch (err) {
            logger.error('Error releasing lock', { lock: lock.key, error: err });
        }
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
