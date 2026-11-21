import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { afterAll, describe, expect, it } from 'vitest';

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Spec for the unthrottled session-token (and secret-key) password hash.
 *
 * An anonymous client who can mint a well-formed connect-session token, agent-session
 * token, or secret key must not be able to make the API run PBKDF2. The private-key
 * or secret lookup still has to run for a guess that is not refused earlier: rejecting
 * every token without a lookup is not a fix. PBKDF2_ITERATIONS is 1 under vitest and
 * 310_000 otherwise; these tests count derivations, and the production constant is
 * checked in a process that does not have VITEST set.
 *
 * Not covered here: deletePrivateKey (no production caller) and persist's
 * authenticateSecret (same secret hash, separate process). Password sign-in is not
 * the same bug: its rate limiter is registered before the hash.
 */

interface QueryState {
    table?: string;
    first: boolean;
}

interface LookupCounts {
    privateKey: number;
    raw: number;
}

const pbkdf2Calls: number[] = [];
const lookups: LookupCounts = { privateKey: 0, raw: 0 };
const rateLimitConsumes: string[] = [];

const originalPbkdf2 = crypto.pbkdf2;
const originalPbkdf2Sync = crypto.pbkdf2Sync;
crypto.pbkdf2 = function (this: unknown, ...args: Parameters<typeof originalPbkdf2>) {
    const iterations = args[2];
    if (typeof iterations === 'number') {
        pbkdf2Calls.push(iterations);
    }
    originalPbkdf2.apply(this, args);
} as typeof crypto.pbkdf2;
crypto.pbkdf2Sync = function (this: unknown, ...args: Parameters<typeof originalPbkdf2Sync>) {
    const iterations = args[2];
    if (typeof iterations === 'number') {
        pbkdf2Calls.push(iterations);
    }
    return originalPbkdf2Sync.apply(this, args);
} as typeof crypto.pbkdf2Sync;

// The spy has to wrap the prototype method the middleware calls later.
// oxlint-disable-next-line typescript/unbound-method
const originalConsume = RateLimiterMemory.prototype.consume;
RateLimiterMemory.prototype.consume = async function (key: string | number, points?: number) {
    rateLimitConsumes.push(String(key));
    if (points === undefined) {
        return originalConsume.call(this, key);
    }
    return originalConsume.call(this, key, points);
};

function chainable(counts: LookupCounts): object {
    const state: QueryState = { first: false };
    const builder: object = new Proxy(
        function target() {
            return undefined;
        },
        {
            apply() {
                return builder;
            },
            get(_target, prop) {
                if (prop === 'then') {
                    return (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
                        if (state.table === 'private_keys') {
                            counts.privateKey += 1;
                        }
                        const value = state.first ? undefined : [];
                        return Promise.resolve(value).then(onFulfilled, onRejected);
                    };
                }
                if (prop === 'catch') {
                    return (onRejected: (reason: unknown) => unknown) => Promise.resolve([]).catch(onRejected);
                }
                if (prop === 'finally') {
                    return (onFinally: () => void) => Promise.resolve([]).finally(onFinally);
                }
                return (...args: unknown[]) => {
                    if ((prop === 'from' || prop === 'into') && typeof args[0] === 'string') {
                        state.table = args[0];
                    }
                    if (prop === 'first') {
                        state.first = true;
                    }
                    if (prop === 'andWhere' && typeof args[0] === 'function') {
                        const visit = args[0] as (query: object) => void;
                        visit(builder);
                    }
                    return builder;
                };
            }
        }
    );
    return builder;
}

function fakeKnex(counts: LookupCounts): object {
    const knexFn = function knexFn() {
        return chainable(counts);
    };
    return new Proxy(knexFn, {
        apply() {
            return chainable(counts);
        },
        get(_target, prop) {
            if (prop === 'raw') {
                return () => {
                    counts.raw += 1;
                    return Promise.resolve({ rows: [] });
                };
            }
            if (prop === 'transaction') {
                return async (callback: (trx: object) => Promise<unknown>) => callback(knexFn);
            }
            if (prop === 'fn') {
                return { now: () => new Date() };
            }
            if (prop === 'client') {
                return {};
            }
            if (prop === 'destroy') {
                return () => Promise.resolve(undefined);
            }
            return () => chainable(counts);
        }
    });
}

const db = (await import('@nangohq/database')).default;
const realKnex = db.knex;
const realReadOnly = db.readOnly;
const replacement = fakeKnex(lookups);
(db as { knex: unknown; readOnly: unknown }).knex = replacement;
(db as { knex: unknown; readOnly: unknown }).readOnly = replacement;
if (realReadOnly !== realKnex) {
    await realReadOnly.destroy();
}
await realKnex.destroy();

const { publicAPI } = await import('../routes.public.js');
afterAll(() => {
    crypto.pbkdf2 = originalPbkdf2;
    crypto.pbkdf2Sync = originalPbkdf2Sync;
    RateLimiterMemory.prototype.consume = originalConsume;
});

function connectSessionToken(): string {
    return `nango_connect_session_${crypto.randomBytes(32).toString('hex')}`;
}

function agentSessionToken(): string {
    return `nango_agent_session_${crypto.randomBytes(32).toString('hex')}`;
}

async function listen(): Promise<{ url: string; server: Server }> {
    const app = express();
    app.use(publicAPI);
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        const message = error instanceof Error ? error.message : 'request failed';
        void res.status(500).json({ error: { code: 'test_handler', message } });
    });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address() as AddressInfo;
    return { url: `http://127.0.0.1:${address.port}`, server };
}

interface Attempt {
    status: number;
    code: string | undefined;
    pbkdf2: number[];
    privateKeyLookups: number;
    rawLookups: number;
    rateLimitConsumes: number;
}

async function attempt(url: string, init: RequestInit): Promise<Attempt> {
    const kdfAt = pbkdf2Calls.length;
    const privateKeyAt = lookups.privateKey;
    const rawAt = lookups.raw;
    const rateAt = rateLimitConsumes.length;
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    const text = await response.text();
    let code: string | undefined;
    if (text) {
        const body = JSON.parse(text) as { error?: { code?: string } };
        code = body.error?.code;
    }
    return {
        status: response.status,
        code,
        pbkdf2: pbkdf2Calls.slice(kdfAt),
        privateKeyLookups: lookups.privateKey - privateKeyAt,
        rawLookups: lookups.raw - rawAt,
        rateLimitConsumes: rateLimitConsumes.length - rateAt
    };
}

function authorization(token: string): { authorization: string } {
    return { authorization: `Bearer ${token}` };
}

describe('unauthenticated session-token password hashing', () => {
    it('keeps the production PBKDF2 work factor at 310000 outside vitest', async () => {
        const encryptionSource = fileURLToPath(new URL('../../../utils/lib/encryption.ts', import.meta.url));
        const child = spawn(
            process.execPath,
            [
                '--experimental-strip-types',
                '--input-type=module',
                '--eval',
                "import { pathToFileURL } from 'node:url'; const mod = await import(pathToFileURL(process.argv[1]).href); process.stdout.write(JSON.stringify({ iterations: mod.PBKDF2_ITERATIONS }));",
                encryptionSource
            ],
            {
                env: (() => {
                    const env = { ...process.env };
                    delete env.VITEST;
                    return env;
                })(),
                cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
            }
        );
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk: string) => {
            stderr += chunk;
        });
        const exitCode = await new Promise<number>((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', (code) => resolve(code ?? 1));
        });
        expect({ exitCode, stderr, stdout }).toMatchObject({ exitCode: 0 });
        expect(JSON.parse(stdout)).toEqual({ iterations: 310_000 });
    });

    it('does not password-hash anonymous session or secret guesses', async () => {
        const { url, server } = await listen();
        try {
            const malformed = await attempt(`${url}/connect/session`, {
                headers: authorization('nango_connect_session_not-hex')
            });
            expect(malformed).toMatchObject({
                status: 401,
                code: 'invalid_connect_session_token_format',
                pbkdf2: [],
                privateKeyLookups: 0,
                rawLookups: 0
            });

            const routes: { name: string; url: string; init: RequestInit; code: string; privateKeyLookups: number; rawLookups: number }[] = [
                {
                    name: 'GET /connect/session',
                    url: `${url}/connect/session`,
                    init: { headers: authorization(connectSessionToken()) },
                    code: 'unknown_connect_session_token',
                    privateKeyLookups: 1,
                    rawLookups: 0
                },
                {
                    name: 'DELETE /connect/session',
                    url: `${url}/connect/session`,
                    init: { method: 'DELETE', headers: authorization(connectSessionToken()) },
                    code: 'unknown_connect_session_token',
                    privateKeyLookups: 1,
                    rawLookups: 0
                },
                {
                    name: 'POST /connect/telemetry',
                    url: `${url}/connect/telemetry`,
                    init: {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ token: connectSessionToken() })
                    },
                    code: 'unknown_connect_session_token',
                    privateKeyLookups: 1,
                    rawLookups: 0
                },
                {
                    name: 'GET /session/:sessionId/mcp',
                    url: `${url}/session/00000000-0000-4000-8000-000000000001/mcp`,
                    init: { headers: authorization(agentSessionToken()) },
                    code: 'unknown_agent_session_token',
                    privateKeyLookups: 1,
                    rawLookups: 0
                },
                {
                    name: 'POST /session/:sessionId/mcp',
                    url: `${url}/session/00000000-0000-4000-8000-000000000001/mcp`,
                    init: {
                        method: 'POST',
                        headers: { ...authorization(agentSessionToken()), 'content-type': 'application/json' },
                        body: '{}'
                    },
                    code: 'unknown_agent_session_token',
                    privateKeyLookups: 1,
                    rawLookups: 0
                },
                {
                    name: 'GET /providers connect session',
                    url: `${url}/providers`,
                    init: { headers: authorization(connectSessionToken()) },
                    code: 'unknown_connect_session_token',
                    privateKeyLookups: 1,
                    rawLookups: 0
                },
                {
                    name: 'GET /integrations connect session',
                    url: `${url}/integrations`,
                    init: { headers: authorization(connectSessionToken()) },
                    code: 'unknown_connect_session_token',
                    privateKeyLookups: 1,
                    rawLookups: 0
                },
                {
                    name: 'GET /oauth/connect connect session query',
                    url: `${url}/oauth/connect/github?connect_session_token=${encodeURIComponent(connectSessionToken())}`,
                    init: {},
                    code: 'unknown_connect_session_token',
                    privateKeyLookups: 1,
                    rawLookups: 0
                },
                {
                    name: 'POST /auth/unauthenticated connect session query',
                    url: `${url}/auth/unauthenticated/github?connect_session_token=${encodeURIComponent(connectSessionToken())}`,
                    init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
                    code: 'unknown_connect_session_token',
                    privateKeyLookups: 1,
                    rawLookups: 0
                },
                {
                    name: 'GET /scripts/config secret key',
                    url: `${url}/scripts/config`,
                    init: { headers: authorization(crypto.randomUUID()) },
                    code: 'unknown_account',
                    privateKeyLookups: 0,
                    rawLookups: 1
                }
            ];

            for (const route of routes) {
                const result = await attempt(route.url, route.init);
                expect({ route: route.name, status: result.status, code: result.code, pbkdf2: result.pbkdf2 }).toEqual({
                    route: route.name,
                    status: 401,
                    code: route.code,
                    pbkdf2: []
                });
                if (route.privateKeyLookups > 0) {
                    expect(result.privateKeyLookups, route.name).toBeGreaterThan(0);
                } else {
                    expect(result.privateKeyLookups, route.name).toBe(0);
                }
                if (route.rawLookups > 0) {
                    expect(result.rawLookups, route.name).toBeGreaterThan(0);
                }
            }

            const repeated = connectSessionToken();
            const first = await attempt(`${url}/connect/session`, { headers: authorization(repeated) });
            const second = await attempt(`${url}/connect/session`, { headers: authorization(repeated) });
            expect([first.pbkdf2, second.pbkdf2]).toEqual([[], []]);
            expect(first.privateKeyLookups).toBeGreaterThan(0);
            expect(first.status).toBe(401);
            expect(first.code).toBe('unknown_connect_session_token');
            expect([401, 429]).toContain(second.status);

            const burstTokens = Array.from({ length: 8 }, () => connectSessionToken());
            const burst = await Promise.all(burstTokens.map((token) => attempt(`${url}/connect/session`, { headers: authorization(token) })));
            expect(burst.every((result) => result.pbkdf2.length === 0)).toBe(true);
            for (const result of burst) {
                expect([401, 429]).toContain(result.status);
                if (result.status === 401) {
                    expect(result.code).toBe('unknown_connect_session_token');
                }
            }
            expect(burst.some((result) => result.status === 401 && result.privateKeyLookups > 0)).toBe(true);
        } finally {
            server.close();
            await once(server, 'close');
        }
    }, 120_000);
});
