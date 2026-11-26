import http from 'node:http';
import { Transform } from 'node:stream';
import zlib from 'node:zlib';

import { isAxiosError } from 'axios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertSafeOutboundUrl, assertSafeOutboundUrlSync } from '@nangohq/egress';
import {
    createMeteringTransport,
    getAxiosConfiguration,
    getProxyConfiguration,
    getServerOutboundUrlPolicy,
    ProxyRequest,
    resetServerOutboundUrlPolicyForTests
} from '@nangohq/shared';
import { axiosInstance } from '@nangohq/utils';

import { principalCan } from '../../authz/principal.js';
import { envs } from '../../env.js';
import { MAX_MCP_PROXY_RESPONSE_BYTES } from '../../services/mcpProxyResponse.js';
import { handleErrorResponse, handleResponse } from './allProxy.js';

import type { LogContext } from '@nangohq/logs';
import type { ConnectionForProxy, DBEnvironment, DBTeam } from '@nangohq/types';
import type { Response } from 'express';
import type { AddressInfo } from 'node:net';
import type { Readable } from 'node:stream';

/**
 * Same ceiling the management MCP proxy already enforces. The HTTP proxy has no
 * equivalent stop, so these tests fail until a response is cut off at this size
 * (or lower) and the upstream stream is destroyed.
 */
const RESPONSE_CAP_BYTES = MAX_MCP_PROXY_RESPONSE_BYTES;
const OVERSIZE_BYTES = RESPONSE_CAP_BYTES + 2 * 1024 * 1024;
/** One zlib or socket chunk may land after the cap is crossed, before destroy runs. */
const READ_SLACK_BYTES = 1024 * 1024;
const PLAIN_CHUNK_BYTES = 64 * 1024;

const repeatedBody = Buffer.alloc(OVERSIZE_BYTES, 0x61);
const gzipBody = zlib.gzipSync(repeatedBody);
const smallErrorBody = Buffer.from('{"ok":true}');

interface CapturedReply {
    statusCode: number;
    sent: unknown;
    written: number;
    logged: unknown[];
    egressed: number[];
    done: Promise<void>;
    res: Response;
}

function captureReply(): CapturedReply {
    let sent: unknown;
    let written = 0;
    const logged: unknown[] = [];
    const egressed: number[] = [];
    let settle: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
        settle = resolve;
    });
    const res = {
        headersSent: false,
        statusCode: 200,
        setHeader() {
            return res;
        },
        status(code: number) {
            res.statusCode = code;
            return res;
        },
        set() {
            return res;
        },
        send(data?: unknown) {
            sent = data;
            res.headersSent = true;
            settle();
            return res;
        },
        writeHead() {
            res.headersSent = true;
            return res;
        },
        end() {
            res.headersSent = true;
            settle();
            return res;
        },
        write(chunk: unknown) {
            written += Buffer.byteLength(chunk as Buffer);
            return true;
        },
        destroy() {
            settle();
            return res;
        },
        on() {
            return res;
        },
        once() {
            return res;
        },
        emit() {
            return false;
        }
    };

    return {
        get statusCode() {
            return res.statusCode;
        },
        get sent() {
            return sent;
        },
        get written() {
            return written;
        },
        logged,
        egressed,
        done,
        res: res as unknown as Response,
        log(body: unknown) {
            logged.push(body);
        }
    } as CapturedReply & { log(body: unknown): void };
}

function byteLength(value: unknown): number {
    if (value == null) {
        return 0;
    }
    if (Buffer.isBuffer(value)) {
        return value.length;
    }
    if (typeof value === 'string') {
        return Buffer.byteLength(value);
    }
    return Buffer.byteLength(JSON.stringify(value));
}

function clientBytes(reply: CapturedReply): number {
    return byteLength(reply.sent) + reply.written;
}

function headerText(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (Array.isArray(value)) {
        const parts = value.map(headerText).filter((part): part is string => part !== undefined);
        return parts.join(', ');
    }
    return undefined;
}

function headerRecord(headers: unknown): Record<string, unknown> {
    if (!headers || typeof headers !== 'object') {
        return {};
    }
    const toJSON = (headers as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === 'function') {
        const json = (toJSON as (this: object) => unknown).call(headers);
        if (json && typeof json === 'object' && !Array.isArray(json)) {
            return json as Record<string, unknown>;
        }
    }
    return headers as Record<string, unknown>;
}

function plainHeaders(headers: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(headerRecord(headers))) {
        const text = headerText(value);
        if (text) {
            out[key.toLowerCase()] = text;
        }
    }
    return out;
}

function observe(source: Readable): { body: Readable; readBytes: () => number; firstByte: () => number | undefined } {
    let readBytes = 0;
    let firstByte: number | undefined;
    const body = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            if (firstByte === undefined && bytes.length > 0) {
                firstByte = bytes[0];
            }
            readBytes += bytes.length;
            callback(null, bytes);
        }
    });
    source.pipe(body);
    body.on('close', () => {
        if (!source.destroyed) {
            source.destroy();
        }
    });
    return {
        body,
        readBytes: () => readBytes,
        firstByte: () => firstByte
    };
}

function logCtxFor(reply: CapturedReply & { log(body: unknown): void }): LogContext {
    return {
        error: (_message: string, meta?: { body?: unknown }) => {
            if (meta && 'body' in meta) {
                reply.log(meta.body);
            }
        },
        success: () => Promise.resolve(),
        failed: () => Promise.resolve(),
        log: () => Promise.resolve()
    } as unknown as LogContext;
}

function connection(): ConnectionForProxy {
    return {
        connection_id: 'connection',
        connection_config: {},
        metadata: null,
        credentials: { type: 'API_KEY', apiKey: 'placeholder' }
    } as ConnectionForProxy;
}

/**
 * The real server policy blocks every loopback target, so an in-process listener cannot be reached
 * through `ProxyRequest.request`. `httpCall` is the method that request uses once the URL has been
 * allowed; the assertions above show a public host is allowed and loopback is not.
 */
async function fetchThroughProxy(origin: string, pathname: string): Promise<{ status: number; headers: Record<string, string>; stream: Readable }> {
    const built = getProxyConfiguration({
        externalConfig: {
            endpoint: pathname,
            providerConfigKey: 'github',
            method: 'GET',
            retries: 0,
            headers: {},
            baseUrlOverride: origin,
            decompress: true,
            responseType: 'stream'
        },
        internalConfig: {
            providerName: 'github',
            monitoringContext: { accountId: 1, environmentId: 1, callsite: 'proxy' }
        }
    });
    if (built.isErr()) {
        throw built.error;
    }

    const axiosConfig = getAxiosConfiguration({
        proxyConfig: built.value,
        connection: connection()
    });
    axiosConfig.timeout = 30_000;
    axiosConfig.transport = createMeteringTransport({
        onBytes: () => undefined,
        beforeRedirect: axiosConfig.beforeRedirect as ((opts: Record<string, unknown>) => void) | undefined,
        maxRedirects: axiosConfig.maxRedirects
    });
    expect(axiosConfig.decompress).toBe(true);
    expect(axiosConfig.responseType).toBe('stream');
    expect(axiosConfig.maxContentLength ?? -1).toBe(-1);

    const proxy = new ProxyRequest({
        proxyConfig: built.value,
        outboundPolicy: getServerOutboundUrlPolicy(),
        maxWaitMs: 30_000,
        idleTimeoutMs: 30_000,
        logger: () => undefined,
        onBytes: () => undefined,
        getConnection: () => connection(),
        getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null, custom: null })
    });

    try {
        const response = await proxy.httpCall(axiosConfig);
        if (!(response.data instanceof Transform) && !isReadable(response.data)) {
            throw new Error('Expected the proxy response body to be a stream');
        }
        return { status: response.status, headers: plainHeaders(response.headers), stream: response.data as Readable };
    } catch (err) {
        if (!isAxiosError(err) || !isReadable(err.response?.data)) {
            throw err;
        }
        return {
            status: err.response.status,
            headers: plainHeaders(err.response.headers),
            stream: err.response.data
        };
    }
}

function isReadable(value: unknown): value is Readable {
    return typeof value === 'object' && value !== null && 'pipe' in value && typeof (value as Readable).pipe === 'function';
}

function expectWithinCap(reply: CapturedReply, observed: ReturnType<typeof observe>): void {
    expect(observed.firstByte()).toBe(0x61);
    expect(observed.readBytes()).toBeLessThanOrEqual(RESPONSE_CAP_BYTES + READ_SLACK_BYTES);
    expect(clientBytes(reply)).toBeLessThanOrEqual(RESPONSE_CAP_BYTES);
    expect(observed.body.readableEnded).toBe(false);
    expect(observed.body.destroyed).toBe(true);
    for (const bytes of reply.egressed) {
        expect(bytes).toBeLessThanOrEqual(RESPONSE_CAP_BYTES);
    }
    for (const body of reply.logged) {
        expect(byteLength(body)).toBeLessThanOrEqual(RESPONSE_CAP_BYTES);
    }
}

describe('HTTP proxy response size', () => {
    let server: http.Server;
    let origin: string;

    beforeAll(async () => {
        server = http.createServer((req, res) => {
            req.resume();
            const path = req.url ?? '/';
            if (path === '/small-error') {
                res.writeHead(500, { 'Content-Type': 'application/json', 'Content-Length': String(smallErrorBody.length) });
                res.end(smallErrorBody);
                return;
            }
            if (path === '/gzip-error') {
                res.writeHead(500, {
                    'Content-Type': 'text/plain',
                    'Content-Encoding': 'gzip',
                    'Content-Length': String(gzipBody.length)
                });
                res.end(gzipBody);
                return;
            }
            if (path === '/plain-error' || path === '/plain-success') {
                res.writeHead(path === '/plain-success' ? 200 : 500, {
                    'Content-Type': 'text/plain',
                    'Content-Length': String(repeatedBody.length)
                });
                let offset = 0;
                const write = () => {
                    if (offset >= repeatedBody.length) {
                        res.end();
                        return;
                    }
                    const end = Math.min(offset + PLAIN_CHUNK_BYTES, repeatedBody.length);
                    const ok = res.write(repeatedBody.subarray(offset, end));
                    offset = end;
                    if (ok) {
                        write();
                    } else {
                        res.once('drain', write);
                    }
                };
                write();
                return;
            }
            res.writeHead(404);
            res.end();
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('lets a default environment secret key call the proxy, and lets a public host be the target', async () => {
        const localsFor = (scopes: string[]) => ({
            account: { id: 7 } as DBTeam,
            environment: { id: 9, account_id: 7, is_production: false } as DBEnvironment,
            apiKeyPrincipal: {
                type: 'api_key' as const,
                source: 'customer_key' as const,
                accountId: 7,
                scopes,
                environmentIds: [9]
            }
        });
        // principalFor caches the principal on the locals object, so each check needs its own locals.
        expect(principalCan(localsFor(['environment:*']), 'environment:proxy')).toBe(true);
        expect(principalCan(localsFor(['environment:logs:read']), 'environment:proxy')).toBe(false);

        expect(envs.NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED).toBe(true);
        resetServerOutboundUrlPolicyForTests();
        const policy = getServerOutboundUrlPolicy();
        await expect(assertSafeOutboundUrl('https://example.com/v1/items', policy, { context: 'proxy' })).resolves.toMatchObject({
            hostname: 'example.com'
        });
        expect(() => assertSafeOutboundUrlSync('http://127.0.0.1/v1', policy, { context: 'proxy' })).toThrow();

        const allowed = getProxyConfiguration({
            externalConfig: {
                endpoint: '/v1/items',
                providerConfigKey: 'github',
                method: 'GET',
                retries: 0,
                headers: {},
                baseUrlOverride: 'https://example.com',
                decompress: true,
                responseType: 'stream'
            },
            internalConfig: { providerName: 'github' }
        });
        expect(allowed.isOk()).toBe(true);
        if (allowed.isErr()) {
            return;
        }
        const config = getAxiosConfiguration({
            proxyConfig: allowed.value,
            connection: connection(),
            outboundPolicy: policy
        });
        expect(config.decompress).toBe(true);
        expect(config.responseType).toBe('stream');
        expect(config.maxContentLength ?? -1).toBe(-1);
        expect(axiosInstance.defaults.maxContentLength ?? -1).toBe(-1);
    });

    it('still forwards an upstream error smaller than the cap', async () => {
        const upstream = await fetchThroughProxy(origin, '/small-error');
        const observed = observe(upstream.stream);
        const reply = captureReply() as CapturedReply & { log(body: unknown): void };
        handleErrorResponse({
            res: reply.res,
            responseStream: { status: upstream.status, headers: upstream.headers, body: observed.body },
            logCtx: logCtxFor(reply),
            onEgressedBytes: (bytes) => reply.egressed.push(bytes)
        });
        await reply.done;

        expect(upstream.status).toBe(500);
        expect(reply.statusCode).toBe(500);
        expect(clientBytes(reply)).toBe(smallErrorBody.length);
        expect(observed.readBytes()).toBe(smallErrorBody.length);
        expect(observed.body.readableEnded).toBe(true);
    });

    it('stops reading a decompressed upstream error once the inflated body passes the cap', async () => {
        expect(gzipBody.length).toBeLessThan(RESPONSE_CAP_BYTES);
        expect(repeatedBody.length).toBeGreaterThan(RESPONSE_CAP_BYTES);

        const upstream = await fetchThroughProxy(origin, '/gzip-error');
        expect(upstream.status).toBe(500);
        expect(upstream.headers['content-encoding'] ?? '').toBe('');

        const observed = observe(upstream.stream);
        const reply = captureReply() as CapturedReply & { log(body: unknown): void };
        handleErrorResponse({
            res: reply.res,
            responseStream: { status: upstream.status, headers: upstream.headers, body: observed.body },
            logCtx: logCtxFor(reply),
            onEgressedBytes: (bytes) => reply.egressed.push(bytes)
        });
        await reply.done;

        expectWithinCap(reply, observed);
    });

    it('stops reading an uncompressed upstream error once the body passes the cap', async () => {
        const upstream = await fetchThroughProxy(origin, '/plain-error');
        expect(upstream.status).toBe(500);
        const observed = observe(upstream.stream);
        const reply = captureReply() as CapturedReply & { log(body: unknown): void };
        handleErrorResponse({
            res: reply.res,
            responseStream: { status: upstream.status, headers: upstream.headers, body: observed.body },
            logCtx: logCtxFor(reply),
            onEgressedBytes: (bytes) => reply.egressed.push(bytes)
        });
        await reply.done;

        expectWithinCap(reply, observed);
    });

    it('stops reading a non-chunked successful response once the body passes the cap', async () => {
        const upstream = await fetchThroughProxy(origin, '/plain-success');
        expect(upstream.status).toBe(200);
        expect(upstream.headers['transfer-encoding'] ?? '').not.toMatch(/chunked/i);
        expect(upstream.headers['content-disposition'] ?? '').not.toMatch(/^(attachment|inline)(;|\s|$)/i);

        const observed = observe(upstream.stream);
        const reply = captureReply() as CapturedReply & { log(body: unknown): void };
        handleResponse({
            res: reply.res,
            responseStream: {
                status: upstream.status,
                headers: upstream.headers,
                body: observed.body,
                wasCompressed: false,
                complete: () => Promise.resolve()
            },
            logCtx: logCtxFor(reply),
            onEgressedBytes: (bytes) => reply.egressed.push(bytes)
        });
        await reply.done;

        expectWithinCap(reply, observed);
    });
});
