import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

import tracer from 'dd-trace';

import { enqueueUploads, failExpiredUploads, readUploadPage, rejectUpload, saveUploadProgress, withQueuedUpload } from '@nangohq/hosted-telemetry';
import { Err, Ok, retry } from '@nangohq/utils';

import { route } from '../cloud/routes/v1/telemetry/postUploads.js';
import { TELEMETRY_UPLOAD_MAX_ROWS, TELEMETRY_UPLOAD_MAX_UNCOMPRESSED_BYTES } from '../cloud/uploads/constants.js';
import { DAY_SETTLE_MINUTES } from './constants.js';
import { mintInstallationToken } from './token.js';

import type { TelemetryUploadHeader, TelemetryUploadRow } from '../cloud/uploads/reader.js';
import type { MetricRow, QueuedUpload } from '@nangohq/hosted-telemetry';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

const deflate = promisify(gzip);

const REQUEST_TIMEOUT_MS = 60_000;
const SEND_ATTEMPTS = 3;
// All the attempts of a page end within this time.
const SEND_DEADLINE_MS = 5 * 60 * 1000;
// The row of an upload is locked while its page is sent. Postgres releases it if the replica hangs for longer than
// this, which has to stay above the time a page can take to send.
const LOCK_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const REJECTED_PAYLOAD_STATUSES = new Set([400, 413]);
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
     * Our upload endpoint rejected the rows we sent. Sending them again gets the same answer until the endpoint or the
     * installation changes. A key or a license that Nango does not accept is not this case.
     */
    get rejectedRows(): boolean {
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

        const deadline = Date.now() + SEND_DEADLINE_MS;
        const sent = await retry(() => send(config, body, deadline), {
            maxAttempts: SEND_ATTEMPTS,
            delayMs: sendRetryDelayMs,
            retryIf: (res) => res.isErr() && res.error.serverSide && Date.now() < deadline
        });
        if (sent.isErr()) {
            span?.setTag('error', sent.error);
        }
        return sent;
    });
}

async function send(config: UploaderConfig, body: Buffer, deadline: number): Promise<Result<void, UploadRequestError>> {
    const token = await mintInstallationToken(config.privateKeyPem, { body });
    let res: Response;
    try {
        res = await fetch(new URL(route.path, config.url), {
            method: route.method,
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/gzip' },
            body,
            signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now()))
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
 * Sends the next page of an upload. Every page tells Nango the range it completes: from the start of the day or the
 * last row of the page before, to its own last row, or to the end of the day when there is nothing left to read. So a
 * day without rows is still one upload. The cursor only moves after Nango accepts the page.
 */
async function uploadPage(config: UploaderConfig, knex: Knex, { day, metric, cursor }: QueuedUpload): Promise<Result<'sent' | 'finished'>> {
    const schema = config.schema && { schema: config.schema };
    const start = new Date(`${day}T00:00:00.000Z`);
    const end = new Date(start.getTime() + DAY_MS);

    const page = await readUploadPage(knex, { day, metric, cursor, limit: TELEMETRY_UPLOAD_MAX_ROWS, ...schema });
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
    const saved = await saveUploadProgress(knex, { day, metric, cursor: last ? { ts: last.ts, attributes: last.attributes } : cursor, done, ...schema });
    if (saved.isErr()) {
        return Err(saved.error);
    }
    return Ok(done ? 'finished' : 'sent');
}

type Upload = Pick<QueuedUpload, 'day' | 'metric'>;
export type UploadStep = { outcome: 'idle' } | ({ outcome: 'sent' | 'finished' } & Upload) | ({ outcome: 'rejected'; rejection: UploadRequestError } & Upload);

/**
 * Sends one page of the oldest queued upload that no other replica is working on. `idle` means there is none.
 *
 * An upload whose rows Nango rejects stays queued, behind the others. It is only sent again by a call whose
 * `rejectedBefore` is later than the rejection, so the caller decides how often. Any other failure is returned and
 * leaves the upload as it was.
 */
export async function uploadNextPage(config: UploaderConfig, { rejectedBefore }: { rejectedBefore: Date }): Promise<Result<UploadStep>> {
    const schema = config.schema && { schema: config.schema };
    const step = await withQueuedUpload<UploadStep>(config.knex, { idleTimeoutMs: LOCK_IDLE_TIMEOUT_MS, rejectedBefore, ...schema }, async (trx, upload) => {
        const { day, metric } = upload;
        const uploaded = await uploadPage(config, trx, upload);
        if (uploaded.isOk()) {
            return Ok({ outcome: uploaded.value, day, metric });
        }
        const rejection = uploaded.error;
        if (!(rejection instanceof UploadRequestError && rejection.rejectedRows)) {
            return Err(rejection);
        }
        const recorded = await rejectUpload(trx, { day, metric, at: new Date(), ...schema });
        if (recorded.isErr()) {
            return Err(recorded.error);
        }
        return Ok({ outcome: 'rejected', day, metric, rejection });
    });
    if (step.isErr()) {
        return Err(step.error);
    }
    return Ok(step.value ?? { outcome: 'idle' });
}

/**
 * Queues the days that ended and are not queued yet, and marks as failed the queued uploads that are now older than
 * the configured number of days. Returns how many it marked.
 */
export async function fillUploadQueue(config: UploaderConfig, { now = new Date() }: { now?: Date } = {}): Promise<Result<{ expired: number }>> {
    // Only the days before `today` are queued, and `today` changes DAY_SETTLE_MINUTES after midnight. So that is the
    // earliest the day before can be sent.
    const settled = new Date(now.getTime() - DAY_SETTLE_MINUTES * 60_000);
    const today = new Date(Date.UTC(settled.getUTCFullYear(), settled.getUTCMonth(), settled.getUTCDate()));
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
    return Ok({ expired: expired.value });
}
