import http from 'node:http';
import os from 'node:os';
import zlib from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { getProvider } from '@nangohq/providers';

import { getConnectionConfig, makeUrl } from '../utils/utils.js';
import connectionService from './connection.service.js';
import { assertSafeOAuthUrl } from './proxy/outbound-policy.js';

import type { Config as ProviderConfig } from '../models/index.js';
import type { DBConnectionDecrypted, ProviderOAuth2 } from '@nangohq/types';
import type { AddressInfo } from 'node:net';

/**
 * Decompressed ceiling for an OAuth client-credentials token response.
 * Credential payloads fit in a few hundred kilobytes; anything larger must be
 * rejected before the process retains it. These tests fail until the exchange
 * stops reading at this limit, including after gzip/deflate decompression.
 */
const MAX_TOKEN_RESPONSE_BYTES = 256 * 1024;
/** One extra undici chunk may be observed before the reader cancels. */
const READ_SLACK_BYTES = 128 * 1024;
const OVERSIZED_TOKEN_BYTES = 2 * 1024 * 1024;

const JSON_PREFIX = Buffer.from('{"access_token":"');
const JSON_SUFFIX = Buffer.from('","token_type":"bearer"}');
const CLIENT_ID = 'placeholder-client-id';
const CLIENT_SECRET = 'placeholder-client-secret';

interface BodyCapture {
    decompressedBytes: number;
}

let restoreFetch: (() => void) | undefined;

afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
});

describe('OAuth client-credentials token response limit', () => {
    it('builds the ADOXX token URL from connection config and allows a public host', async () => {
        const catalog = getProvider('adoxx-cc');
        expect(catalog?.auth_mode).toBe('OAUTH2_CC');
        expect(catalog?.token_url).toBe('https://${connectionConfig.baseUrl}/oauth2/token');
        expect(catalog?.connection_config?.['baseUrl']?.format).toBeUndefined();
        expect(catalog?.connection_config?.['baseUrl']?.pattern).toBeUndefined();

        const supplied = getConnectionConfig({ baseUrl: 'example.com', webhook_url: 'https://example.com/hook' });
        expect(supplied).toEqual({ baseUrl: 'example.com' });

        const tokenUrl = catalog?.token_url;
        if (typeof tokenUrl !== 'string') {
            throw new Error('adoxx-cc token_url is not a string');
        }
        const url = makeUrl(tokenUrl, supplied);
        expect(url.href).toBe('https://example.com/oauth2/token');

        const checked = await assertSafeOAuthUrl(url.href);
        expect(checked.hostname).toBe('example.com');
    });

    it('accepts a small token body from a connection-config host the outbound policy allows', async () => {
        const capture = watchFetch();
        const host = reachablePrivateHost();
        const outcome = await withTokenServer(
            host,
            { status: 200, contentType: 'application/json', body: jsonBody(Buffer.from('ok-token')) },
            async (provider) => {
                return connectionService.getOauthClientCredentials({
                    provider,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    connectionConfig: { baseUrl: host },
                    logCtx: logContextGetter.getBuffer({ accountId: 1 })
                });
            }
        );

        expect(outcome.result?.success).toBe(true);
        expect(outcome.result?.response?.token).toBe('ok-token');
        expect(capture.decompressedBytes).toBeGreaterThan(0);
        expect(capture.decompressedBytes).toBeLessThanOrEqual(MAX_TOKEN_RESPONSE_BYTES);
    });

    it('accepts a token body that is exactly the decompressed limit', async () => {
        const token = Buffer.alloc(MAX_TOKEN_RESPONSE_BYTES - JSON_PREFIX.length - JSON_SUFFIX.length, 0x62);
        const capture = watchFetch();
        const host = reachablePrivateHost();
        const outcome = await withTokenServer(host, { status: 200, contentType: 'application/json', body: jsonBody(token) }, async (provider) => {
            return connectionService.getOauthClientCredentials({
                provider,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                connectionConfig: { baseUrl: host },
                logCtx: logContextGetter.getBuffer({ accountId: 1 })
            });
        });

        expect(outcome.result?.success).toBe(true);
        expect(outcome.result?.response?.token).toBe(token.toString('utf8'));
        expect(capture.decompressedBytes).toBeLessThanOrEqual(MAX_TOKEN_RESPONSE_BYTES);
    });

    it('stops reading an oversized JSON token body during connection setup', async () => {
        const capture = watchFetch();
        const host = reachablePrivateHost();
        const outcome = await withTokenServer(
            host,
            { status: 200, contentType: 'application/json', body: jsonBody(Buffer.alloc(OVERSIZED_TOKEN_BYTES, 0x63)) },
            async (provider) => {
                return connectionService.getOauthClientCredentials({
                    provider,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    connectionConfig: { baseUrl: host },
                    logCtx: logContextGetter.getBuffer({ accountId: 1 })
                });
            }
        );

        expectRejectedWithinLimit(outcome, capture);
    });

    it('stops reading an oversized JSON token body when refreshing client-credentials', async () => {
        const capture = watchFetch();
        const host = reachablePrivateHost();
        const outcome = await withTokenServer(
            host,
            { status: 200, contentType: 'application/json', body: jsonBody(Buffer.alloc(OVERSIZED_TOKEN_BYTES, 0x64)) },
            async (provider) => {
                return connectionService.getNewCredentials({
                    connection: clientCredentialsConnection(host),
                    providerConfig: { provider: 'adoxx-cc', unique_key: 'adoxx-cc' } as ProviderConfig,
                    provider,
                    logCtx: logContextGetter.getBuffer({ accountId: 1 })
                });
            }
        );

        expectRejectedWithinLimit(outcome, capture);
    });

    it('stops reading a gzip token body once the decompressed payload exceeds the limit', async () => {
        const capture = watchFetch();
        const host = reachablePrivateHost();
        const plain = jsonBody(Buffer.alloc(OVERSIZED_TOKEN_BYTES, 0x65));
        const gzip = zlib.gzipSync(plain);
        expect(gzip.length).toBeLessThan(MAX_TOKEN_RESPONSE_BYTES);

        const outcome = await withTokenServer(
            host,
            {
                status: 200,
                contentType: 'application/json',
                contentEncoding: 'gzip',
                body: gzip
            },
            async (provider) => {
                return connectionService.getOauthClientCredentials({
                    provider,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    connectionConfig: { baseUrl: host },
                    logCtx: logContextGetter.getBuffer({ accountId: 1 })
                });
            }
        );

        expectRejectedWithinLimit(outcome, capture);
    });

    it('stops reading an oversized text token body', async () => {
        const capture = watchFetch();
        const host = reachablePrivateHost();
        const outcome = await withTokenServer(
            host,
            { status: 200, contentType: 'text/plain', body: jsonBody(Buffer.alloc(OVERSIZED_TOKEN_BYTES, 0x66)) },
            async (provider) => {
                return connectionService.getOauthClientCredentials({
                    provider,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    connectionConfig: { baseUrl: host },
                    logCtx: logContextGetter.getBuffer({ accountId: 1 })
                });
            }
        );

        expectRejectedWithinLimit(outcome, capture);
    });

    it('stops reading an oversized error token body before it is retained', async () => {
        const capture = watchFetch();
        const host = reachablePrivateHost();
        const outcome = await withTokenServer(
            host,
            { status: 500, contentType: 'application/json', body: jsonBody(Buffer.alloc(OVERSIZED_TOKEN_BYTES, 0x67)) },
            async (provider) => {
                return connectionService.getOauthClientCredentials({
                    provider,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    connectionConfig: { baseUrl: host },
                    logCtx: logContextGetter.getBuffer({ accountId: 1 })
                });
            }
        );

        expectRejectedWithinLimit(outcome, capture);
    });
});

interface ExchangeOutcome {
    result?: { success: boolean; error: unknown; response: unknown } | undefined;
    thrown?: unknown;
}

function expectRejectedWithinLimit(outcome: ExchangeOutcome, capture: BodyCapture): void {
    const response = outcome.result?.success ? outcome.result.response : null;
    const token = response && typeof response === 'object' && 'token' in response && typeof response.token === 'string' ? response.token.length : 0;
    expect(token).toBe(0);
    expect(capture.decompressedBytes).toBeGreaterThan(64 * 1024);
    expect(capture.decompressedBytes).toBeLessThanOrEqual(MAX_TOKEN_RESPONSE_BYTES + READ_SLACK_BYTES);

    const message = errorText(outcome);
    expect(message.length).toBeLessThan(8192);
}

function errorText(outcome: ExchangeOutcome): string {
    if (outcome.thrown instanceof Error) {
        return outcome.thrown.message;
    }
    const error: unknown = outcome.result?.error;
    if (error instanceof Error) {
        return error.message;
    }
    return '';
}

function jsonBody(token: Buffer): Buffer {
    return Buffer.concat([JSON_PREFIX, token, JSON_SUFFIX]);
}

function clientCredentialsConnection(host: string): DBConnectionDecrypted {
    return {
        connection_config: { baseUrl: host },
        credentials: {
            type: 'OAUTH2_CC',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            token: 'placeholder-token',
            expires_at: new Date(Date.now() + 60_000),
            raw: {}
        }
    } as unknown as DBConnectionDecrypted;
}

/**
 * Count decompressed bytes the product actually pulls from the fetch body.
 * `Response#json` / `Response#text` read this stream; gzip has already been decoded
 * by the runtime fetch implementation before these chunks are delivered.
 */
function watchFetch(): BodyCapture {
    const capture: BodyCapture = { decompressedBytes: 0 };
    const original = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const res = await original(input, init);
        if (!res.body) {
            return res;
        }
        const reader = res.body.getReader();
        const stream = new ReadableStream<Uint8Array>({
            async pull(controller) {
                const { done, value } = await reader.read();
                if (done) {
                    controller.close();
                    return;
                }
                capture.decompressedBytes += value.byteLength;
                controller.enqueue(value);
            },
            cancel(reason) {
                return reader.cancel(reason);
            }
        });
        return new Response(stream, { status: res.status, statusText: res.statusText, headers: res.headers });
    };
    restoreFetch = () => {
        globalThis.fetch = original;
    };
    return capture;
}

function reachablePrivateHost(): string {
    const fallback: string[] = [];
    for (const [name, entries] of Object.entries(os.networkInterfaces())) {
        for (const entry of entries ?? []) {
            if (entry.family !== 'IPv4' || entry.internal) {
                continue;
            }
            const [first, second] = entry.address.split('.').map((part) => Number(part));
            const isPrivate =
                first === 10 ||
                (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
                (first === 192 && second === 168) ||
                (first === 100 && second !== undefined && second >= 64 && second <= 127);
            if (!isPrivate) {
                continue;
            }
            if (name === 'docker0') {
                fallback.push(entry.address);
            } else {
                return entry.address;
            }
        }
    }
    const host = fallback[0];
    if (!host) {
        throw new Error(
            'No RFC1918 address is available. Loopback is blocked by the OAuth outbound policy, so the token server must bind a private address that policy allows.'
        );
    }
    return host;
}

interface TokenResponse {
    status: number;
    contentType: string;
    contentEncoding?: string;
    body: Buffer;
}

async function withTokenServer<T>(
    host: string,
    response: TokenResponse,
    fn: (provider: ProviderOAuth2) => Promise<T>
): Promise<{ result?: T; thrown?: unknown }> {
    const server = http.createServer((req, res) => {
        req.resume();
        const headers: Record<string, string> = { 'content-type': response.contentType };
        if (response.contentEncoding) {
            headers['content-encoding'] = response.contentEncoding;
        }
        res.writeHead(response.status, headers);
        void writeChunked(res, response.body);
    });
    await new Promise<void>((resolve) => {
        server.listen(0, host, resolve);
    });
    const { port } = server.address() as AddressInfo;
    const catalog = getProvider('adoxx-cc');
    if (!catalog || catalog.auth_mode !== 'OAUTH2_CC' || typeof catalog.token_url !== 'string') {
        throw new Error('adoxx-cc is not an OAUTH2_CC provider');
    }
    const provider = { ...catalog, token_url: 'http://${connectionConfig.baseUrl}:' + String(port) + '/oauth2/token' } as ProviderOAuth2;

    try {
        try {
            return { result: await fn(provider) };
        } catch (err) {
            return { thrown: err };
        }
    } finally {
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    }
}

async function writeChunked(res: http.ServerResponse, body: Buffer): Promise<void> {
    const chunkSize = 16 * 1024;
    for (let offset = 0; offset < body.length; ) {
        if (res.destroyed || res.writableEnded) {
            return;
        }
        const slice = body.subarray(offset, Math.min(offset + chunkSize, body.length));
        const accepted = res.write(slice);
        offset += slice.length;
        if (!accepted) {
            await new Promise<void>((resolve) => {
                const finish = () => {
                    res.off('drain', finish);
                    res.off('close', finish);
                    resolve();
                };
                res.once('drain', finish);
                res.once('close', finish);
            });
        }
    }
    if (!res.writableEnded) {
        res.end();
    }
}
