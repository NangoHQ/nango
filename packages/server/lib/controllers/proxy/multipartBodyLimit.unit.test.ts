/**
 * Public proxy multipart uploads must stay within the public body limit.
 *
 * The server reads `NANGO_SERVER_PUBLIC_BODY_LIMIT` when the router is imported, so start
 * vitest with that variable already set. `FLAG_API_RATE_LIMIT_ENABLED` defaults to on and
 * is unrelated to body size; turn it off so a request cap cannot hide a body that was accepted.
 *
 *   NANGO_SERVER_PUBLIC_BODY_LIMIT=256kb FLAG_API_RATE_LIMIT_ENABLED=false \
 *     npm run test:unit -- packages/server/lib/controllers/proxy/multipartBodyLimit.unit.test.ts
 */
import { EventEmitter, once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';

import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ApiKeyContext, DBEnvironment, DBTeam } from '@nangohq/types';
import type * as NodeFS from 'node:fs';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

// The dashboard session store opens Postgres as soon as the router is imported. The proxy
// path under test authenticates with a secret key and never reads that store.
vi.mock('connect-session-knex', () => {
    const factory = () =>
        class KnexSessionStore extends EventEmitter {
            public constructor(_options?: unknown) {
                super();
            }
        };
    return { default: factory };
});

const require = createRequire(import.meta.url);
const nodeFs = require('node:fs') as typeof NodeFS;
const bytes = require('bytes') as { parse: (value: string) => number | null };

const PUBLIC_BODY_LIMIT = '256kb';
// Obvious placeholders. They only have to match the secret-key shape so the real auth middleware
// reaches the account lookup, which this file stubs.
const ENVIRONMENT_WIDE_SECRET = '00000000-0000-4000-8000-000000000001';
const NARROW_SECRET = '00000000-0000-4000-8000-000000000002';
const BOUNDARY = 'nango-proxy-limit';
const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

if (process.env['NANGO_SERVER_PUBLIC_BODY_LIMIT'] !== PUBLIC_BODY_LIMIT) {
    throw new Error(
        `Set NANGO_SERVER_PUBLIC_BODY_LIMIT=${PUBLIC_BODY_LIMIT} before starting vitest. The router reads it at import, and the default is large enough to hide this bug in a unit test.`
    );
}

const originalCreateWriteStream = nodeFs.createWriteStream;
const originalOpen = nodeFs.open;
const originalPromisesOpen = (path: NodeFS.PathLike, flags?: NodeFS.OpenMode, mode?: NodeFS.Mode | null) => nodeFs.promises.open(path, flags, mode);
// Saved before the wrapper below replaces it. An arrow that calls Buffer.concat would recurse.
// oxlint-disable-next-line unbound-method
const originalConcat = Buffer.concat;
const createdFiles: string[] = [];
const concatenated: number[] = [];
let trackFiles = false;
let trackConcat = false;

// Memory storage and busboy both assemble a part with Buffer.concat once they have kept it.
// Socket buffers also show up in process.memoryUsage(), so the concat results are the signal
// that the parser retained the upload.
Buffer.concat = function (list: readonly Uint8Array[], totalLength?: number): Buffer {
    const result = originalConcat.call(Buffer, list as Uint8Array[], totalLength);
    if (trackConcat && result.length >= 4096) {
        concatenated.push(result.length);
    }
    return result;
} as typeof Buffer.concat;

function noteFile(path: unknown) {
    if (trackFiles) {
        createdFiles.push(String(path));
    }
}

nodeFs.createWriteStream = function (this: unknown, path: unknown, options?: unknown) {
    noteFile(path);
    return originalCreateWriteStream.call(this, path as never, options as never);
} as typeof nodeFs.createWriteStream;
nodeFs.open = function (this: unknown, ...args: unknown[]) {
    noteFile(args[0]);
    return (originalOpen as (...openArgs: unknown[]) => unknown).apply(this, args);
} as typeof nodeFs.open;
nodeFs.promises.open = ((path: NodeFS.PathLike, flags?: NodeFS.OpenMode, mode?: NodeFS.Mode | null) => {
    noteFile(path);
    return originalPromisesOpen(path, flags, mode);
}) as typeof nodeFs.promises.open;

interface Part {
    name: string;
    filename?: string;
    size: number;
}

interface UploadResult {
    status: number;
    json: unknown;
    /** Bytes of part bodies handed to the socket before the status line arrived. */
    bodyBytesBeforeStatus: number;
    /** Bytes assembled with Buffer.concat while the request was in flight. */
    retainedBytes: number;
    filesCreated: string[];
}

function contextFor(scopes: string[]): ApiKeyContext {
    return {
        account: { id: 1 } as DBTeam,
        environment: { id: 5, account_id: 1, is_production: false } as DBEnvironment,
        plan: null,
        principal: {
            type: 'api_key',
            source: 'customer_key',
            accountId: 1,
            scopes,
            environmentIds: [5],
            keyId: 1
        },
        auth: {
            source: 'customer_key',
            scopes,
            apiKeyId: 1
        }
    };
}

function partHeader(part: Part): string {
    const disposition = part.filename ? `form-data; name="${part.name}"; filename="${part.filename}"` : `form-data; name="${part.name}"`;
    const type = part.filename ? 'Content-Type: application/octet-stream\r\n' : '';
    return `--${BOUNDARY}\r\nContent-Disposition: ${disposition}\r\n${type}\r\n`;
}

function closingBoundary(): string {
    return `--${BOUNDARY}--\r\n`;
}

function contentLength(parts: Part[]): number {
    let length = 0;
    for (const part of parts) {
        length += Buffer.byteLength(partHeader(part)) + part.size + 2;
    }
    length += Buffer.byteLength(closingBoundary());
    return length;
}

async function writeOrDrain(req: ClientRequest, chunk: Buffer) {
    if (!req.write(chunk)) {
        await once(req, 'drain');
    }
}

function retainedBytes(): number {
    return concatenated.reduce((sum, size) => sum + size, 0);
}

/**
 * Stream a multipart body. Part payloads are one reused chunk, so the client does not retain the upload.
 * `stopBeforeBody` flushes the headers and gives the server a turn before any part bytes are written.
 */
async function upload({
    port,
    method,
    secret,
    parts,
    stopBeforeBody
}: {
    port: number;
    method: string;
    secret?: string;
    parts: Part[];
    stopBeforeBody?: boolean;
}): Promise<UploadResult> {
    const reusable = Buffer.alloc(16 * 1024, 0x61);
    createdFiles.length = 0;
    concatenated.length = 0;
    trackFiles = true;
    trackConcat = true;

    const req = httpRequest({
        host: '127.0.0.1',
        port,
        method,
        path: '/proxy/upload',
        headers: {
            ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
            'Content-Type': `multipart/form-data; boundary=${BOUNDARY}`,
            'Content-Length': contentLength(parts)
        }
    });

    let status = 0;
    let raw = '';
    let bodyBytesBeforeStatus = 0;
    let sentBodies = 0;
    let sawStatus: () => void = () => undefined;
    const statusSeen = new Promise<void>((resolve) => {
        sawStatus = resolve;
    });
    const response = new Promise<void>((resolve, reject) => {
        req.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'ECONNRESET' && status !== 0) {
                resolve();
                return;
            }
            reject(err);
        });
        req.on('response', (res: IncomingMessage) => {
            status = res.statusCode ?? 0;
            bodyBytesBeforeStatus = sentBodies;
            sawStatus();
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => {
                raw += chunk;
            });
            res.on('end', () => resolve());
            res.on('error', reject);
        });
    });

    const writeBodies = async () => {
        for (const part of parts) {
            await writeOrDrain(req, Buffer.from(partHeader(part)));
            let left = part.size;
            while (left > 0) {
                const n = Math.min(reusable.length, left);
                const piece = n === reusable.length ? reusable : reusable.subarray(0, n);
                await writeOrDrain(req, piece);
                sentBodies += n;
                left -= n;
            }
            await writeOrDrain(req, Buffer.from('\r\n'));
        }
        await writeOrDrain(req, Buffer.from(closingBoundary()));
    };

    // The request handler does not run until the client yields. Flush the headers and wait so a
    // rejection that happens before the parser can be observed without sending the file.
    req.flushHeaders();
    if (stopBeforeBody) {
        const early = await Promise.race([
            statusSeen.then(() => 'status' as const),
            new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 500))
        ]);
        if (early === 'status') {
            await response;
            req.destroy();
            trackFiles = false;
            trackConcat = false;
            return parsedResult(status, raw, bodyBytesBeforeStatus);
        }
    }

    await writeBodies();
    req.end();
    await response;
    trackFiles = false;
    trackConcat = false;
    return parsedResult(status, raw, bodyBytesBeforeStatus);
}

function parsedResult(status: number, raw: string, bodyBytesBeforeStatus: number): UploadResult {
    let json: unknown = raw;
    try {
        json = JSON.parse(raw) as unknown;
    } catch {
        // Keep the raw body when it is not JSON.
    }
    return {
        status,
        json,
        bodyBytesBeforeStatus,
        retainedBytes: retainedBytes(),
        filesCreated: [...createdFiles]
    };
}

describe.sequential('public proxy multipart body limit', () => {
    let port = 0;
    let close: () => Promise<void> = () => Promise.resolve();

    beforeAll(async () => {
        const { accountService } = await import('@nangohq/shared');
        vi.spyOn(accountService, 'getAccountContextByApiKey').mockImplementation((opts) => {
            const secret = 'secretKey' in opts ? opts.secretKey : undefined;
            if (secret === ENVIRONMENT_WIDE_SECRET) {
                // Default customer keys are stored with environment:*, which the real scope check expands.
                return Promise.resolve(contextFor(['environment:*']));
            }
            if (secret === NARROW_SECRET) {
                return Promise.resolve(contextFor(['environment:logs:read']));
            }
            return Promise.resolve(null);
        });

        const { router } = await import('../../routes.js');
        const app = express();
        app.use(router);
        const server = app.listen(0, '127.0.0.1');
        await once(server, 'listening');
        port = (server.address() as AddressInfo).port;
        close = () =>
            new Promise((resolve) => {
                server.close(() => resolve());
            });
    }, 60_000);

    afterAll(async () => {
        await close();
        nodeFs.createWriteStream = originalCreateWriteStream;
        nodeFs.open = originalOpen;
        nodeFs.promises.open = originalPromisesOpen;
        Buffer.concat = originalConcat;
        vi.restoreAllMocks();
        const db = (await import('@nangohq/database')).default;
        await db.destroy();
    });

    async function authenticated(method: string, parts: Part[], secret = ENVIRONMENT_WIDE_SECRET): Promise<UploadResult> {
        return upload({ port, method, secret, parts });
    }

    it('rejects an oversized JSON body on the proxy route with the public body limit', async () => {
        const { envs } = await import('../../env.js');
        const limit = bytes.parse(envs.NANGO_SERVER_PUBLIC_BODY_LIMIT);
        expect(limit).toBe(bytes.parse(PUBLIC_BODY_LIMIT));

        const padding = (limit ?? 0) * 8;
        const prefix = Buffer.from('{"padding":"');
        const suffix = Buffer.from('"}');
        concatenated.length = 0;
        trackConcat = true;
        const reusable = Buffer.alloc(16 * 1024, 0x62);

        const req = httpRequest({
            host: '127.0.0.1',
            port,
            method: 'POST',
            path: '/proxy/upload',
            headers: {
                Authorization: `Bearer ${ENVIRONMENT_WIDE_SECRET}`,
                'Content-Type': 'application/json',
                'Content-Length': prefix.length + padding + suffix.length
            }
        });
        const body = new Promise<{ status: number; json: unknown }>((resolve, reject) => {
            req.on('error', reject);
            req.on('response', (res) => {
                let raw = '';
                res.setEncoding('utf8');
                res.on('data', (chunk: string) => {
                    raw += chunk;
                });
                res.on('end', () => {
                    resolve({ status: res.statusCode ?? 0, json: JSON.parse(raw) as unknown });
                });
            });
        });

        await writeOrDrain(req, prefix);
        let left = padding;
        while (left > 0) {
            const n = Math.min(reusable.length, left);
            await writeOrDrain(req, n === reusable.length ? reusable : reusable.subarray(0, n));
            left -= n;
        }
        await writeOrDrain(req, suffix);
        req.end();
        const res = await body;
        trackConcat = false;

        expect(res.status).toBe(413);
        expect(res.json).toMatchObject({
            error: { code: 'request_too_large', message: expect.stringContaining('Request entity too large') as unknown }
        });
        // JSON already stops at the public limit, so this locks the Buffer.concat measurement.
        expect(retainedBytes(), `JSON parser retained ${retainedBytes()} bytes`).toBeLessThanOrEqual((limit ?? 0) + 64 * 1024);
    });

    it('lets a small multipart file reach the proxy handler', async () => {
        const res = await authenticated('POST', [{ name: 'file', filename: 'small.bin', size: 1024 }]);

        expect(res.status).toBe(400);
        expect(res.json).toMatchObject({ error: { code: 'invalid_headers' } });
        expect(res.filesCreated).toEqual([]);
    });

    it.each(METHODS)('rejects one %s file larger than the public body limit before the file is buffered', async (method) => {
        const limit = bytes.parse(PUBLIC_BODY_LIMIT) ?? 0;
        const size = limit * 8;
        const res = await authenticated(method, [{ name: 'file', filename: 'large.bin', size }]);

        expect(res.status, `${JSON.stringify(res.json)} assembled=${res.retainedBytes}`).toBe(413);
        expect(res.json).toMatchObject({
            error: { code: 'request_too_large', message: expect.stringContaining('Request entity too large') as unknown }
        });
        expect(res.filesCreated, `created files: ${res.filesCreated.join(', ')}`).toEqual([]);
        expect(res.retainedBytes, `parser assembled ${res.retainedBytes} bytes of a ${size} byte file; public limit is ${limit}`).toBeLessThanOrEqual(
            limit + 64 * 1024
        );
    });

    it('rejects file parts that are each under the public body limit when their total is over it', async () => {
        const limit = bytes.parse(PUBLIC_BODY_LIMIT) ?? 0;
        const partSize = Math.floor(limit * 0.9);
        const parts = Array.from({ length: 8 }, (_, index) => ({ name: `file${index}`, filename: `part-${index}.bin`, size: partSize }));
        const res = await authenticated('POST', parts);

        expect(res.status, `${JSON.stringify(res.json)} assembled=${res.retainedBytes}`).toBe(413);
        expect(res.json).toMatchObject({ error: { code: 'request_too_large' } });
        expect(res.filesCreated).toEqual([]);
        expect(res.retainedBytes, `parser assembled ${res.retainedBytes} bytes across ${parts.length} files of ${partSize}`).toBeLessThanOrEqual(
            limit + 64 * 1024
        );
    });

    it('rejects text fields that are each under the public body limit when their total is over it', async () => {
        const limit = bytes.parse(PUBLIC_BODY_LIMIT) ?? 0;
        const partSize = Math.floor(limit * 0.9);
        const parts = Array.from({ length: 8 }, (_, index) => ({ name: `field${index}`, size: partSize }));
        const res = await authenticated('POST', parts);

        expect(res.status, `${JSON.stringify(res.json)} assembled=${res.retainedBytes}`).toBe(413);
        expect(res.json).toMatchObject({ error: { code: 'request_too_large' } });
        expect(res.filesCreated).toEqual([]);
        expect(res.retainedBytes, `parser assembled ${res.retainedBytes} bytes across ${parts.length} fields of ${partSize}`).toBeLessThanOrEqual(
            limit + 64 * 1024
        );
    });

    it('refuses a key without environment:proxy before reading the multipart file', async () => {
        const limit = bytes.parse(PUBLIC_BODY_LIMIT) ?? 0;
        const size = limit * 8;
        const res = await upload({
            port,
            method: 'POST',
            secret: NARROW_SECRET,
            parts: [{ name: 'file', filename: 'large.bin', size }],
            stopBeforeBody: true
        });

        expect(res.status).toBe(403);
        expect(res.json).toMatchObject({ error: { code: 'forbidden' } });
        expect(res.bodyBytesBeforeStatus).toBe(0);
        expect(res.filesCreated).toEqual([]);
        expect(res.retainedBytes).toBe(0);
    });

    it('refuses a missing credential before reading the multipart file', async () => {
        const limit = bytes.parse(PUBLIC_BODY_LIMIT) ?? 0;
        const size = limit * 8;
        const res = await upload({
            port,
            method: 'POST',
            parts: [{ name: 'file', filename: 'large.bin', size }],
            stopBeforeBody: true
        });

        expect(res.status).toBe(401);
        expect(res.bodyBytesBeforeStatus).toBe(0);
        expect(res.filesCreated).toEqual([]);
        expect(res.retainedBytes).toBe(0);
    });
});
