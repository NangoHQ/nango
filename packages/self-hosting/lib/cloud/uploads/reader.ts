import { createGunzip } from 'node:zlib';

import * as z from 'zod';

import { Err, Ok } from '@nangohq/utils';

import {
    TELEMETRY_UPLOAD_ATTRIBUTES_MAX_BYTES,
    TELEMETRY_UPLOAD_MAX_LINE_BYTES,
    TELEMETRY_UPLOAD_MAX_ROWS,
    TELEMETRY_UPLOAD_MAX_UNCOMPRESSED_BYTES,
    TELEMETRY_UPLOAD_TS_MAX_AGE_MS,
    TELEMETRY_UPLOAD_TS_MAX_AHEAD_MS
} from './constants.js';

import type { InstallationMetricRow } from '../clickhouse/metrics.js';
import type { Result } from '@nangohq/utils';

const NEWLINE = 0x0a;
// The decoder would drop a byte order mark at the start of every line it is given.
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

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

function parseLine(line: string): unknown {
    try {
        return JSON.parse(line);
    } catch {
        return undefined;
    }
}

/** Sorted keys, so the same attributes are the same bytes whichever installation version sent them. */
function canonicalAttributes(attributes: TelemetryUploadRow['attributes']): string {
    return JSON.stringify(attributes, Object.keys(attributes).sort());
}

const invalidHeader = () => new UploadError('invalid_header', 'the first line must be a header naming the installation');
const invalidEncoding = () => new UploadError('invalid_encoding', 'the body must be a gzip file of UTF-8 text');

/** Inflates the body block by block and reads each line as it completes, so the inflated file is never held whole. */
export async function readUpload(body: Buffer): Promise<Result<{ installationId: string; rows: InstallationMetricRow[] }, UploadError>> {
    const now = Date.now();
    const rows: InstallationMetricRow[] = [];
    let installationId: string | undefined;
    let lineNumber = 0;

    const tooLong = () =>
        lineNumber === 0 ? invalidHeader() : new UploadError('invalid_row', `line ${lineNumber + 1} is over ${TELEMETRY_UPLOAD_MAX_LINE_BYTES} bytes`);

    const readLine = (line: Buffer): UploadError | undefined => {
        if (line.length > TELEMETRY_UPLOAD_MAX_LINE_BYTES) {
            return tooLong();
        }
        lineNumber += 1;

        let text: string;
        try {
            text = utf8.decode(line);
        } catch {
            return invalidEncoding();
        }

        if (lineNumber === 1) {
            const header = telemetryUploadHeaderSchema.safeParse(parseLine(text));
            if (!header.success) {
                return invalidHeader();
            }
            installationId = header.data.installation_id;
            return;
        }

        if (rows.length === TELEMETRY_UPLOAD_MAX_ROWS) {
            return new UploadError('too_many_rows', `an upload holds at most ${TELEMETRY_UPLOAD_MAX_ROWS} rows`);
        }
        const row = telemetryUploadRowSchema.safeParse(parseLine(text));
        if (!row.success) {
            return new UploadError('invalid_row', `line ${lineNumber} is not a valid row`);
        }
        const ts = new Date(row.data.ts);
        if (ts.getTime() < now - TELEMETRY_UPLOAD_TS_MAX_AGE_MS || ts.getTime() > now + TELEMETRY_UPLOAD_TS_MAX_AHEAD_MS) {
            return new UploadError('invalid_row', `line ${lineNumber} has a timestamp too far in the past or the future`);
        }
        const attributes = canonicalAttributes(row.data.attributes);
        if (Buffer.byteLength(attributes) > TELEMETRY_UPLOAD_ATTRIBUTES_MAX_BYTES) {
            return new UploadError('invalid_row', `line ${lineNumber} has attributes over ${TELEMETRY_UPLOAD_ATTRIBUTES_MAX_BYTES} bytes`);
        }
        rows.push({ ts, metric: row.data.metric, attributes, value: row.data.value });
        return;
    };

    const gunzip = createGunzip();
    gunzip.end(body);

    let inflated = 0;
    let unfinished: Buffer = Buffer.alloc(0);
    try {
        for await (const block of gunzip as AsyncIterable<Buffer>) {
            inflated += block.length;
            if (inflated > TELEMETRY_UPLOAD_MAX_UNCOMPRESSED_BYTES) {
                return Err(new UploadError('request_too_large', `an upload holds at most ${TELEMETRY_UPLOAD_MAX_UNCOMPRESSED_BYTES} bytes uncompressed`));
            }

            let start = 0;
            for (let end = block.indexOf(NEWLINE); end !== -1; end = block.indexOf(NEWLINE, start)) {
                const error = readLine(Buffer.concat([unfinished, block.subarray(start, end)]));
                if (error) {
                    return Err(error);
                }
                unfinished = Buffer.alloc(0);
                start = end + 1;
            }
            unfinished = Buffer.concat([unfinished, block.subarray(start)]);
            if (unfinished.length > TELEMETRY_UPLOAD_MAX_LINE_BYTES) {
                return Err(tooLong());
            }
        }
    } catch {
        return Err(invalidEncoding());
    }

    // A file may end without a final newline.
    if (unfinished.length > 0) {
        const error = readLine(unfinished);
        if (error) {
            return Err(error);
        }
    }
    if (!installationId) {
        return Err(invalidHeader());
    }
    return Ok({ installationId, rows });
}
