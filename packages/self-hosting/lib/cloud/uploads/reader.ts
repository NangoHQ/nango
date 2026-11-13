import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';

import * as z from 'zod';

import { Err, Ok } from '@nangohq/utils';

import {
    TELEMETRY_UPLOAD_ATTRIBUTES_MAX_BYTES,
    TELEMETRY_UPLOAD_MAX_ROWS,
    TELEMETRY_UPLOAD_MAX_UNCOMPRESSED_BYTES,
    TELEMETRY_UPLOAD_TS_MAX_AGE_MS,
    TELEMETRY_UPLOAD_TS_MAX_AHEAD_MS
} from './constants.js';

import type { InstallationMetricRow } from '../clickhouse/metrics.js';
import type { Result } from '@nangohq/utils';

const inflate = promisify(gunzip);
const utf8 = new TextDecoder('utf-8', { fatal: true });

/** An upload is a gzip file of NDJSON: the first line is the header, every other line is a row. */
export const telemetryUploadHeaderSchema = z.object({
    kind: z.literal('header'),
    installation_id: z.uuid().toLowerCase()
});

export const telemetryUploadRowSchema = z.object({
    kind: z.literal('row'),
    ts: z.iso.datetime({ precision: 3 }),
    metric: z.string().min(1).max(255),
    attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    value: z.number()
});

export type TelemetryUploadHeader = z.infer<typeof telemetryUploadHeaderSchema>;
export type TelemetryUploadRow = z.infer<typeof telemetryUploadRowSchema>;

export type UploadErrorCode = 'invalid_encoding' | 'request_too_large' | 'too_many_rows' | 'invalid_header' | 'invalid_row';

export class UploadError extends Error {
    public readonly code: UploadErrorCode;

    constructor(code: UploadErrorCode, message: string) {
        super(message);
        this.name = 'UploadError';
        this.code = code;
    }
}

function parseLine(line: string | undefined): unknown {
    try {
        return JSON.parse(line ?? '');
    } catch {
        return undefined;
    }
}

/** Sorted keys, so the same attributes are the same bytes whichever installation version sent them. */
function canonicalAttributes(attributes: TelemetryUploadRow['attributes']): string {
    return JSON.stringify(attributes, Object.keys(attributes).sort());
}

export async function readUpload(body: Buffer): Promise<Result<{ installationId: string; rows: InstallationMetricRow[] }, UploadError>> {
    let text: string;
    try {
        text = utf8.decode(await inflate(body, { maxOutputLength: TELEMETRY_UPLOAD_MAX_UNCOMPRESSED_BYTES }));
    } catch (err) {
        return Err(
            err instanceof RangeError
                ? new UploadError('request_too_large', `an upload holds at most ${TELEMETRY_UPLOAD_MAX_UNCOMPRESSED_BYTES} bytes uncompressed`)
                : new UploadError('invalid_encoding', 'the body must be a gzip file of UTF-8 text')
        );
    }

    // We stop splitting just past the limit, so a file of millions of empty lines does not become millions of strings.
    const lines = text.split('\n', TELEMETRY_UPLOAD_MAX_ROWS + 3);
    if (lines.at(-1) === '') {
        lines.pop();
    }
    const [first, ...rest] = lines;

    const header = telemetryUploadHeaderSchema.safeParse(parseLine(first));
    if (!header.success) {
        return Err(new UploadError('invalid_header', 'the first line must be a header naming the installation'));
    }
    if (rest.length > TELEMETRY_UPLOAD_MAX_ROWS) {
        return Err(new UploadError('too_many_rows', `an upload holds at most ${TELEMETRY_UPLOAD_MAX_ROWS} rows`));
    }

    const now = Date.now();
    const rows: InstallationMetricRow[] = [];
    for (const [index, line] of rest.entries()) {
        const row = telemetryUploadRowSchema.safeParse(parseLine(line));
        if (!row.success) {
            return Err(new UploadError('invalid_row', `line ${index + 2} is not a valid row`));
        }
        const ts = new Date(row.data.ts);
        if (ts.getTime() < now - TELEMETRY_UPLOAD_TS_MAX_AGE_MS || ts.getTime() > now + TELEMETRY_UPLOAD_TS_MAX_AHEAD_MS) {
            return Err(new UploadError('invalid_row', `line ${index + 2} has a timestamp too far in the past or the future`));
        }
        const attributes = canonicalAttributes(row.data.attributes);
        if (Buffer.byteLength(attributes) > TELEMETRY_UPLOAD_ATTRIBUTES_MAX_BYTES) {
            return Err(new UploadError('invalid_row', `line ${index + 2} has attributes over ${TELEMETRY_UPLOAD_ATTRIBUTES_MAX_BYTES} bytes`));
        }
        rows.push({ ts, metric: row.data.metric, attributes, value: row.data.value });
    }
    return Ok({ installationId: header.data.installation_id, rows });
}
