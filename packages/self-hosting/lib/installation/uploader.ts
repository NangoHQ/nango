import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

import tracer from 'dd-trace';

import { enqueueClosedDays, failExpiredUploads, failUpload, listQueuedUploads, readUploadPage, saveUploadProgress } from '@nangohq/hosted-telemetry';
import { Err, Ok, retry } from '@nangohq/utils';

import { route } from '../cloud/routes/v1/telemetry/postUploads.js';
import { TELEMETRY_UPLOAD_MAX_ROWS } from '../cloud/uploads/constants.js';
import { logger } from '../utils.js';
import { mintInstallationToken } from './token.js';

import type { TelemetryUploadHeader, TelemetryUploadRow } from '../cloud/uploads/reader.js';
import type { MetricRow, QueuedUpload } from '@nangohq/hosted-telemetry';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

const deflate = promisify(gzip);

const REQUEST_TIMEOUT_MS = 60_000;
const SEND_ATTEMPTS = 3;
const PERMANENT_STATUSES = new Set([400, 401, 403, 413]);
// A breath between requests, so a backlog does not reach Nango as one burst.
const uploadPauseMs = () => 5_000 + Math.random() * 5_000;
// A wait of its own between attempts, so installations that failed together do not come back together.
const sendRetryDelayMs = () => 500 + Math.random() * 2_000;
const DAY_MS = 24 * 60 * 60 * 1000;
// What is older is not sent any more: if Nango needs it, it is asked for by hand.
const BACKFILL_DAYS = 30;

export interface UploaderConfig {
    knex: Knex;
    schema?: string;
    installationId: string;
    privateKeyPem: string;
    url: string;
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

    /** Nango could not be reached or failed on its side: worth another attempt right away. */
    get serverSide(): boolean {
        return this.status === undefined || this.status >= 500;
    }

    /**
     * The upload endpoint turned this request down and would again. An answer that carries none of its error codes
     * came from something in between, a proxy or a route that is not deployed yet, and goes out again on a later run.
     */
    get permanent(): boolean {
        return this.status !== undefined && PERMANENT_STATUSES.has(this.status) && this.code !== undefined && this.code !== 'clock_skew';
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

async function sendPage(
    config: UploaderConfig,
    { day, metric, rows }: { day: string; metric: string; rows: MetricRow[] }
): Promise<Result<void, UploadRequestError>> {
    return await tracer.trace('nango.self_hosting.upload.send', async (span) => {
        span?.addTags({ metric, day, rows: rows.length });

        const header: TelemetryUploadHeader = { kind: 'header', installation_id: config.installationId };
        const lines: (TelemetryUploadHeader | TelemetryUploadRow)[] = [
            header,
            ...rows.map((row) => ({ kind: 'row' as const, ts: row.ts.toISOString(), metric: row.metric, attributes: row.attributes, value: row.value }))
        ];
        const body = await deflate(lines.map((line) => JSON.stringify(line)).join('\n'));

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
 * Sends what is left of a metric's day, a page at a time, moving the cursor only past what Nango acknowledged. Once the
 * deadline has passed it hands the day back unfinished.
 */
async function uploadDay(config: UploaderConfig, { day, metric, cursor }: QueuedUpload, deadline: Date): Promise<Result<'finished' | 'out_of_time'>> {
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
        const last = page.value.at(-1);
        if (last) {
            const sent = await sendPage(config, { day, metric, rows: page.value });
            if (sent.isErr()) {
                return Err(sent.error);
            }
            cursor = { ts: last.ts, attributes: last.attributes };
        }

        const done = page.value.length < TELEMETRY_UPLOAD_MAX_ROWS;
        const saved = await saveUploadProgress(config.knex, { day, metric, cursor, done, ...(config.schema && { schema: config.schema }) });
        if (saved.isErr()) {
            return Err(saved.error);
        }
        if (last) {
            await setTimeout(uploadPauseMs());
        }
        if (done) {
            return Ok('finished');
        }
    }
}

/**
 * Sends every closed day of the last 30 that Nango has not acknowledged yet, oldest first, until the deadline. It stops at
 * a failure worth retrying, and the next run starts again from there. A day the upload endpoint turns down for good is
 * marked as failed and the next one goes.
 */
export async function uploadQueuedDays(
    config: UploaderConfig,
    { now = new Date(), deadline }: { now?: Date; deadline: Date }
): Promise<Result<{ succeeded: number; failed: number; outOfTime: boolean }>> {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const since = new Date(today.getTime() - BACKFILL_DAYS * DAY_MS);
    const schema = config.schema && { schema: config.schema };

    const enqueued = await enqueueClosedDays(config.knex, { since, today, ...schema });
    if (enqueued.isErr()) {
        return Err(enqueued.error);
    }
    const expired = await failExpiredUploads(config.knex, { since, ...schema });
    if (expired.isErr()) {
        return Err(expired.error);
    }
    if (expired.value > 0) {
        logger.error(`${expired.value} uploads are older than ${BACKFILL_DAYS} days and failed, they have to be asked for by hand`);
    }
    const queued = await listQueuedUploads(config.knex, { since, ...schema });
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
            logger.error(`Upload of ${upload.metric} for ${upload.day} failed, it has to be asked for by hand`, uploaded.error);
        } else {
            return Err(uploaded.error);
        }
    }
    return Ok({ succeeded, failed, outOfTime: false });
}
