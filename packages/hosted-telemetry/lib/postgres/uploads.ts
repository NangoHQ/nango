import { Err, Ok } from '@nangohq/utils';

import { HOSTED_TELEMETRY_SCHEMA, HOSTED_TELEMETRY_TABLE, HOSTED_TELEMETRY_UPLOADS_TABLE } from './schema.js';

import type { MetricRow } from '../exporter.js';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

/** The last row Nango acknowledged for a metric and a day: the next page starts right after it. */
export interface UploadCursor {
    ts: Date;
    attributes: MetricRow['attributes'];
}

export interface QueuedUpload {
    day: string;
    metric: string;
    cursor: UploadCursor | null;
}

/** Days are UTC days, whatever the time zone of the database session. */
const utcDay = (date: Date) => date.toISOString().slice(0, 10);
const startOf = (day: string) => `${day}T00:00:00Z`;

/** Gives every metric of each closed day from `since` an upload to track, for the days that have none yet. */
export async function enqueueClosedDays(
    knex: Knex,
    { since, today, schema = HOSTED_TELEMETRY_SCHEMA }: { since: Date; today: Date; schema?: string }
): Promise<Result<void>> {
    try {
        await knex.raw(
            `INSERT INTO ??.?? (day, metric)
             SELECT (d.start AT TIME ZONE 'UTC')::date, m.metric
             FROM generate_series(?::timestamptz, ?::timestamptz - interval '24 hours', interval '24 hours') AS d(start)
             CROSS JOIN LATERAL (
                 SELECT DISTINCT metric FROM ??.?? WHERE ts >= d.start AND ts < d.start + interval '24 hours'
             ) m
             WHERE NOT EXISTS (SELECT 1 FROM ??.?? u WHERE u.day = (d.start AT TIME ZONE 'UTC')::date)
             ON CONFLICT DO NOTHING`,
            [
                schema,
                HOSTED_TELEMETRY_UPLOADS_TABLE,
                startOf(utcDay(since)),
                startOf(utcDay(today)),
                schema,
                HOSTED_TELEMETRY_TABLE,
                schema,
                HOSTED_TELEMETRY_UPLOADS_TABLE
            ]
        );
        return Ok(undefined);
    } catch (err) {
        return Err(err);
    }
}

/** Oldest first. A succeeded or failed upload is never picked up again. */
export async function listQueuedUploads(
    knex: Knex,
    { since, schema = HOSTED_TELEMETRY_SCHEMA }: { since: Date; schema?: string }
): Promise<Result<QueuedUpload[]>> {
    try {
        const res = await knex.raw<{ rows: { day: string; metric: string; cursor_ts: Date | null; cursor_attributes: MetricRow['attributes'] | null }[] }>(
            `SELECT day::text AS day, metric, cursor_ts, cursor_attributes FROM ??.??
             WHERE status = 'queued' AND day >= ?::date
             ORDER BY day, metric`,
            [schema, HOSTED_TELEMETRY_UPLOADS_TABLE, utcDay(since)]
        );
        return Ok(
            res.rows.map((row) => ({
                day: row.day,
                metric: row.metric,
                cursor: row.cursor_ts && row.cursor_attributes ? { ts: row.cursor_ts, attributes: row.cursor_attributes } : null
            }))
        );
    } catch (err) {
        return Err(err);
    }
}

/** The rows of a metric for a day after the cursor, in primary key order. */
export async function readUploadPage(
    knex: Knex,
    {
        day,
        metric,
        cursor,
        limit,
        schema = HOSTED_TELEMETRY_SCHEMA
    }: { day: string; metric: string; cursor: UploadCursor | null; limit: number; schema?: string }
): Promise<Result<MetricRow[]>> {
    try {
        const res = await knex.raw<{ rows: Omit<MetricRow, 'metric'>[] }>(
            `SELECT ts, attributes, value FROM ??.??
             WHERE metric = ? AND ts >= ?::timestamptz AND ts < ?::timestamptz + interval '24 hours'
             ${cursor ? 'AND (ts, attributes) > (?::timestamptz, ?::jsonb)' : ''}
             ORDER BY ts, attributes
             LIMIT ?`,
            [
                schema,
                HOSTED_TELEMETRY_TABLE,
                metric,
                startOf(day),
                startOf(day),
                ...(cursor ? [cursor.ts.toISOString(), JSON.stringify(cursor.attributes)] : []),
                limit
            ]
        );
        return Ok(res.rows.map((row) => ({ ...row, metric })));
    } catch (err) {
        return Err(err);
    }
}

export async function saveUploadProgress(
    knex: Knex,
    {
        day,
        metric,
        cursor,
        done,
        schema = HOSTED_TELEMETRY_SCHEMA
    }: { day: string; metric: string; cursor: UploadCursor | null; done: boolean; schema?: string }
): Promise<Result<void>> {
    try {
        await knex.raw(
            `UPDATE ??.?? SET cursor_ts = ?::timestamptz, cursor_attributes = ?::jsonb, status = CASE WHEN ? THEN 'succeeded' ELSE status END
             WHERE day = ?::date AND metric = ? AND status = 'queued'`,
            [
                schema,
                HOSTED_TELEMETRY_UPLOADS_TABLE,
                cursor ? cursor.ts.toISOString() : null,
                cursor ? JSON.stringify(cursor.attributes) : null,
                done,
                day,
                metric
            ]
        );
        return Ok(undefined);
    } catch (err) {
        return Err(err);
    }
}

/** What was not sent of a failed upload has to be asked for by hand. */
export async function failUpload(
    knex: Knex,
    { day, metric, schema = HOSTED_TELEMETRY_SCHEMA }: { day: string; metric: string; schema?: string }
): Promise<Result<void>> {
    try {
        await knex.raw(`UPDATE ??.?? SET status = 'failed' WHERE day = ?::date AND metric = ? AND status = 'queued'`, [
            schema,
            HOSTED_TELEMETRY_UPLOADS_TABLE,
            day,
            metric
        ]);
        return Ok(undefined);
    } catch (err) {
        return Err(err);
    }
}

/** What is still queued from before `since` will not be sent any more, and has to be asked for by hand like any failed upload. */
export async function failExpiredUploads(knex: Knex, { since, schema = HOSTED_TELEMETRY_SCHEMA }: { since: Date; schema?: string }): Promise<Result<number>> {
    try {
        const res = await knex.raw<{ rowCount: number }>(`UPDATE ??.?? SET status = 'failed' WHERE status = 'queued' AND day < ?::date`, [
            schema,
            HOSTED_TELEMETRY_UPLOADS_TABLE,
            utcDay(since)
        ]);
        return Ok(res.rowCount);
    } catch (err) {
        return Err(err);
    }
}
