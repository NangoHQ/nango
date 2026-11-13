import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

import tracer from 'dd-trace';

import { enqueueUploads, failExpiredUploads, failUpload, listQueuedUploads, readUploadPage, saveUploadProgress } from '@nangohq/hosted-telemetry';
import { Err, Ok, retry } from '@nangohq/utils';

import { route } from '../cloud/routes/v1/telemetry/postUploads.js';
import { TELEMETRY_UPLOAD_MAX_ROWS, TELEMETRY_UPLOAD_MAX_UNCOMPRESSED_BYTES } from '../cloud/uploads/constants.js';
import { logger } from '../utils.js';
import { mintInstallationToken } from './token.js';

import type { TelemetryUploadHeader, TelemetryUploadRow } from '../cloud/uploads/reader.js';
import type { MetricRow, QueuedUpload } from '@nangohq/hosted-telemetry';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

const deflate = promisify(gzip);

const REQUEST_TIMEOUT_MS = 60_000;
const SEND_ATTEMPTS = 3;
const REJECTED_PAYLOAD_STATUSES = new Set([400, 413]);
// We wait a few seconds between requests, so a backlog does not hit Nango all at once.
const uploadPauseMs = () => 5_000 + Math.random() * 5_000;
// A random wait before retrying, so installations that failed together do not retry together.
const sendRetryDelayMs = () => 500 + Math.random() * 2_000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Room kept for the header line, which is written after the rows of the upload are chosen.
const HEADER_MAX_BYTES = 1024;

export interface UploaderConfig {
    knex: Knex;
    schema?: string;
    installationId: string;
    privateKeyPem: string;
    url: string;
    backfillDays: number;
    /** Uploaded for every day, with or without rows. */
    metrics: string[];
    licenseGraceUntil: Date;
}

export class UploadRequestError extends Error {
    public readonly status: number | undefined;
    public readonly code: string | undefined;

    constructor(message: string, { status, code, cause }: { status?: number; code?: string | undefined; cause?: unknown } = {}) {
        super(message, { cause });
        this.name = 'UploadRequestError';
        this.status = status;
        this.code = code;
    }

    /** Nango is down or failing. Worth retrying right away. */
    get serverSide(): boolean {
        return this.status === undefined || this.status >= 500;
    }

    /**
     * Our upload endpoint rejected the rows we sent and would reject them again, so we do not retry. Any other answer is
     * retried on a later run. That includes a key or a license that Nango does not accept, because fixing it does not
     * change the rows.
     */
    get permanent(): boolean {
        return this.status !== undefined && REJECTED_PAYLOAD_STATUSES.has(this.status) && this.code !== undefined;
    }
}

function errorCode(body: string): string | undefined {
    try {
        const parsed: unknown = JSON.parse(body);
        const error = typeof parsed === 'object' && parsed !== null && 'error' in parsed ? parsed.error : undefined;
        return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
    } catch {
        return undefined;
    }
}

/** The rows as upload lines, as many of the first ones as fit in one upload. */
function linesThatFit(rows: MetricRow[]): string[] {
    const lines: string[] = [];
    let bytes = HEADER_MAX_BYTES;
    for (const row of rows) {
        const fields: TelemetryUploadRow = { kind: 'row', ts: row.ts.toISOString(), metric: row.metric, attributes: row.attributes, value: row.value };
        const line = JSON.stringify(fields);
        bytes += 1 + Buffer.byteLength(line);
        if (bytes > TELEMETRY_UPLOAD_MAX_UNCOMPRESSED_BYTES) {
            break;
        }
        lines.push(line);
    }
    return lines;
}

async function sendPage(
    config: UploaderConfig,
    { day, metric, from, to, lines }: { day: string; metric: string; from: Date; to: Date; lines: string[] }
): Promise<Result<void, UploadRequestError>> {
    return await tracer.trace('nango.self_hosting.upload.send', async (span) => {
        span?.addTags({ metric, day, rows: lines.length });

        const header: TelemetryUploadHeader = {
            kind: 'header',
            installation_id: config.installationId,
            metric,
            from: from.toISOString(),
            to: to.toISOString()
        };
        const body = await deflate([JSON.stringify(header), ...lines].join('\n'));

        const sent = await retry(() => send(config, body), {
            maxAttempts: SEND_ATTEMPTS,
            delayMs: sendRetryDelayMs,
            retryIf: (res) => res.isErr() && res.error.serverSide
        });
        if (sent.isErr()) {
            span?.setTag('error', sent.error);
        }
        return sent;
    });
}

async function send(config: UploaderConfig, body: Buffer): Promise<Result<void, UploadRequestError>> {
    const token = await mintInstallationToken(config.privateKeyPem, { body });
    let res: Response;
    try {
        res = await fetch(new URL(route.path, config.url), {
            method: route.method,
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/gzip' },
            body,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
    } catch (err) {
        return Err(new UploadRequestError(`could not reach ${config.url}`, { cause: err }));
    }
    if (res.ok) {
        return Ok(undefined);
    }
    const answer = await res.text();
    return Err(new UploadRequestError(`Nango answered ${res.status}: ${answer}`, { status: res.status, code: errorCode(answer) }));
}

/**
 * Uploads the rows of a metric for one day, page by page. Every page tells Nango the range it completes: from the
 * start of the day or the last row of the page before, to its own last row, or to the end of the day when there is
 * nothing left to read. So a day without rows is still one upload. The cursor only moves after Nango accepts a page.
 * Stops early if the run is out of time.
 */
async function uploadDay(config: UploaderConfig, { day, metric, cursor }: QueuedUpload, deadline: Date): Promise<Result<'finished' | 'out_of_time'>> {
    const start = new Date(`${day}T00:00:00.000Z`);
    const end = new Date(start.getTime() + DAY_MS);
    for (;;) {
        if (Date.now() >= deadline.getTime()) {
            return Ok('out_of_time');
        }
        const page = await readUploadPage(config.knex, {
            day,
            metric,
            cursor,
            limit: TELEMETRY_UPLOAD_MAX_ROWS,
            ...(config.schema && { schema: config.schema })
        });
        if (page.isErr()) {
            return Err(page.error);
        }
        const lines = linesThatFit(page.value);
        const last = page.value[lines.length - 1];
        const done = page.value.length < TELEMETRY_UPLOAD_MAX_ROWS && lines.length === page.value.length;
        const from = cursor?.ts ?? start;

        const sent = await sendPage(config, { day, metric, from, to: done ? end : (last?.ts ?? from), lines });
        if (sent.isErr()) {
            return Err(sent.error);
        }
        if (last) {
            cursor = { ts: last.ts, attributes: last.attributes };
        }

        const saved = await saveUploadProgress(config.knex, { day, metric, cursor, done, ...(config.schema && { schema: config.schema }) });
        if (saved.isErr()) {
            return Err(saved.error);
        }
        await setTimeout(uploadPauseMs());
        if (done) {
            return Ok('finished');
        }
    }
}

/**
 * Uploads everything in the queue, oldest first. It stops when the run is out of time, when Nango is failing or when
 * Nango does not accept the installation, and the next run continues from there. An upload whose rows Nango rejects is
 * marked as failed and skipped.
 */
export async function uploadQueuedDays(
    config: UploaderConfig,
    { now = new Date(), deadline }: { now?: Date; deadline: Date }
): Promise<Result<{ succeeded: number; failed: number; outOfTime: boolean }>> {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const since = new Date(today.getTime() - config.backfillDays * DAY_MS);
    const schema = config.schema && { schema: config.schema };

    const enqueued = await enqueueUploads(config.knex, { since, today, metrics: config.metrics, ...schema });
    if (enqueued.isErr()) {
        return Err(enqueued.error);
    }
    const expired = await failExpiredUploads(config.knex, { since, ...schema });
    if (expired.isErr()) {
        return Err(expired.error);
    }
    if (expired.value > 0) {
        logger.error(`${expired.value} uploads are older than ${config.backfillDays} days and were marked as failed. Request the data manually`);
    }
    const queued = await listQueuedUploads(config.knex, { ...schema });
    if (queued.isErr()) {
        return Err(queued.error);
    }

    let succeeded = 0;
    let failed = expired.value;
    for (const upload of queued.value) {
        const uploaded = await uploadDay(config, upload, deadline);
        if (uploaded.isOk()) {
            if (uploaded.value === 'out_of_time') {
                return Ok({ succeeded, failed, outOfTime: true });
            }
            succeeded++;
        } else if (uploaded.error instanceof UploadRequestError && uploaded.error.permanent) {
            const marked = await failUpload(config.knex, { day: upload.day, metric: upload.metric, ...schema });
            if (marked.isErr()) {
                return Err(marked.error);
            }
            failed++;
            logger.error(`Upload of ${upload.metric} for ${upload.day} failed and will not be retried. Request the data manually`, uploaded.error);
        } else {
            return Err(uploaded.error);
        }
    }
    return Ok({ succeeded, failed, outOfTime: false });
}
