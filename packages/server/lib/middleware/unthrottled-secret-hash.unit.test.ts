import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { secretService } from '@nangohq/shared';
import { PBKDF2_ITERATIONS } from '@nangohq/utils';

import { apiAuth } from './env-auth.js';

import type { KeyRegistry } from '@nangohq/internal-auth';
import type { Express } from 'express';

/**
 * Spec for secret-key authentication work-factor limits.
 *
 * These tests fail while an unknown bearer is PBKDF2-derived before any
 * per-IP failure limit and before a negative cache. They pass once each
 * client IP, as `req.ip` with `trust proxy` 1, gets at most
 * MAX_UNKNOWN_BEARER_DERIVATIONS_PER_IP derivations for bearers that are not
 * a stored key, and a repeated unknown bearer is derived at most once.
 * Stored keys still go through the slow hash.
 *
 * The default libuv pool is 4 workers, so that cap is the most one client
 * may schedule. Vitest forces PBKDF2_ITERATIONS to 1; the production work
 * factor is asserted in a process that does not have VITEST set.
 */
const MAX_UNKNOWN_BEARER_DERIVATIONS_PER_IP = 4;

const hashOriginal = secretService.hashSecret.bind(secretService);
let derivations = 0;

vi.spyOn(secretService, 'hashSecret').mockImplementation(async (plainText: string) => {
    derivations += 1;
    return hashOriginal(plainText);
});

interface CustomerHit {
    hash: string;
    row: {
        account: { id: number; created_at: string; updated_at: string };
        environment: null;
        plan: null;
        default_secret: null;
        pending_secret: null;
        environment_ids: number[];
        auth_scopes: string[];
        auth_api_key_id: number;
        auth_api_key_uuid: string;
        auth_display_name: string;
    };
}

interface PersistHit {
    hash: string;
    row: {
        account_id: number;
        environment_id: number;
        environment_name: string;
        plan_id: null;
        plan_name: null;
        records_store: null;
    };
}

let customerHit: CustomerHit | null = null;
let persistHit: PersistHit | null = null;
let server: { url: string; close: () => Promise<void> };
const observedIps: string[] = [];
let ipOctet = 10;

function nextIp(): string {
    ipOctet += 1;
    return `203.0.113.${ipOctet}`;
}

function resetDerivations(): void {
    derivations = 0;
}

function callJoin(args: unknown[]): void {
    const callback = args.find((arg) => typeof arg === 'function') as ((clause: { on: () => unknown; andOn: () => unknown }) => void) | undefined;
    if (!callback) {
        return;
    }
    const clause = {
        on() {
            return clause;
        },
        andOn() {
            return clause;
        }
    };
    callback(clause);
}

function lookupBuilder() {
    let hashed: string | undefined;
    const builder = {
        from() {
            return builder;
        },
        join(...args: unknown[]) {
            callJoin(args);
            return builder;
        },
        leftJoin(...args: unknown[]) {
            callJoin(args);
            return builder;
        },
        where(column: unknown, value?: unknown) {
            if (column === 'api_secrets.hashed' && typeof value === 'string') {
                hashed = value;
            }
            return builder;
        },
        whereIn() {
            return builder;
        },
        first() {
            if (persistHit && hashed === persistHit.hash) {
                return Promise.resolve(persistHit.row);
            }
            return Promise.resolve(undefined);
        }
    };
    return builder;
}

async function listen(app: Express): Promise<{ url: string; close: () => Promise<void> }> {
    return await new Promise((resolve) => {
        const httpServer = app.listen(0, '127.0.0.1', () => {
            const address = httpServer.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () =>
                    new Promise((done) => {
                        httpServer.close(() => done());
                    })
            });
        });
    });
}

async function request(path: string, ip: string, bearer: string, extraHeaders?: Record<string, string>) {
    const response = await fetch(`${server.url}${path}`, {
        headers: {
            authorization: `Bearer ${bearer}`,
            'x-forwarded-for': ip,
            ...extraHeaders
        }
    });
    const text = await response.text();
    let body: { error?: { code?: string }; ok?: boolean } | undefined;
    if (text) {
        body = JSON.parse(text) as { error?: { code?: string }; ok?: boolean };
    }
    return { status: response.status, body };
}

describe('unthrottled secret-key PBKDF2', () => {
    beforeAll(async () => {
        expect(db.readOnly).toBe(db.knex);

        vi.spyOn(db.knex, 'select').mockImplementation(() => lookupBuilder() as never);
        vi.spyOn(db.knex, 'raw').mockImplementation(((sql: unknown, bindings?: readonly unknown[]) => {
            if (typeof sql === 'string' && sql.includes('matched_customer_key')) {
                const hash = bindings?.[0];
                if (customerHit && hash === customerHit.hash) {
                    return Promise.resolve({ rows: [customerHit.row] });
                }
                return Promise.resolve({ rows: [] });
            }
            return { toQuery: () => '' };
        }) as never);

        const { authenticate } = await import('../../../persist/lib/middleware/capability.js');
        const app = express();
        // Same setting as packages/server/lib/server.ts so req.ip is the forwarded client.
        app.set('trust proxy', 1);
        app.use((req, _res, next) => {
            if (req.ip) {
                observedIps.push(req.ip);
            }
            next();
        });
        app.get('/environments', ...apiAuth, (_req, res) => {
            res.status(200).json({ ok: true });
        });
        app.get('/environment/:environmentId/records', authenticate({} as KeyRegistry), (_req, res) => {
            res.status(200).json({ ok: true });
        });
        server = await listen(app);
    });

    afterAll(async () => {
        await server.close();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        customerHit = null;
        persistHit = null;
        resetDerivations();
    });

    it('rejects a non-uuid public API bearer without deriving', async () => {
        const ip = nextIp();
        const response = await request('/environments', ip, 'not-a-uuid');

        expect(response.status).toBe(401);
        expect(response.body?.error?.code).toBe('invalid_secret_key_format');
        expect(derivations).toBe(0);
        expect(observedIps.at(-1)).toBe(ip);
    });

    it('still derives a stored customer key and accepts it', async () => {
        const bearer = crypto.randomUUID();
        const hashed = await hashOriginal(bearer);
        expect(hashed.isOk()).toBe(true);
        if (hashed.isErr()) {
            return;
        }
        expect(hashed.value).not.toBe(bearer);
        customerHit = {
            hash: hashed.value,
            row: {
                account: { id: 1, created_at: '2020-01-01T00:00:00.000Z', updated_at: '2020-01-01T00:00:00.000Z' },
                environment: null,
                plan: null,
                default_secret: null,
                pending_secret: null,
                environment_ids: [],
                auth_scopes: ['environment:*'],
                auth_api_key_id: 1,
                auth_api_key_uuid: '00000000-0000-4000-8000-000000000001',
                auth_display_name: 'placeholder'
            }
        };
        resetDerivations();

        const first = await request('/environments', nextIp(), bearer);
        const second = await request('/environments', nextIp(), bearer);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(derivations).toBeGreaterThanOrEqual(1);
        expect(derivations).toBeLessThanOrEqual(2);
    });

    it('derives one unknown public API bearer once and does not derive it again', async () => {
        const ip = nextIp();
        const bearer = crypto.randomUUID();

        const first = await request('/environments', ip, bearer);
        expect(first.status).toBe(401);
        expect(first.body?.error?.code).toBe('unknown_account');
        expect(derivations).toBe(1);

        const second = await request('/environments', ip, bearer);
        const third = await request('/environments', ip, bearer);

        expect([401, 429]).toContain(second.status);
        expect([401, 429]).toContain(third.status);
        expect(derivations).toBe(1);
    });

    it('does not derive a distinct unknown public API bearer for every request from one IP', async () => {
        const ip = nextIp();
        const bearers = Array.from({ length: 8 }, () => crypto.randomUUID());

        const responses = await Promise.all(bearers.map((bearer) => request('/environments', ip, bearer)));

        for (const response of responses) {
            expect(response.status).not.toBe(200);
            expect(response.status).not.toBe(500);
            expect([401, 429]).toContain(response.status);
        }
        expect(derivations).toBeGreaterThan(0);
        expect(derivations).toBeLessThanOrEqual(MAX_UNKNOWN_BEARER_DERIVATIONS_PER_IP);

        const afterParallel = derivations;
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const response = await request('/environments', ip, crypto.randomUUID());
            expect([401, 429]).toContain(response.status);
        }
        expect(derivations).toBe(afterParallel);
    });

    it('applies the same limits when the caller sets Nango-Is-Script', async () => {
        const ip = nextIp();
        const bearer = crypto.randomUUID();
        const headers = { 'nango-is-script': 'true' };

        const first = await request('/environments', ip, bearer, headers);
        expect(first.status).toBe(401);
        expect(first.body?.error?.code).toBe('unknown_account');
        expect(derivations).toBe(1);

        await request('/environments', ip, bearer, headers);
        await request('/environments', ip, bearer, headers);
        expect(derivations).toBe(1);

        const more = Array.from({ length: 8 }, () => crypto.randomUUID());
        const responses = await Promise.all(more.map((token) => request('/environments', ip, token, headers)));
        for (const response of responses) {
            expect([401, 429]).toContain(response.status);
        }
        expect(derivations).toBeLessThanOrEqual(MAX_UNKNOWN_BEARER_DERIVATIONS_PER_IP);
    });

    it('derives one unknown persist bearer once and does not derive it again', async () => {
        const ip = nextIp();
        const bearer = crypto.randomUUID();

        const first = await request('/environment/1/records', ip, bearer);
        expect(first.status).toBe(401);
        expect(first.body?.error?.code).toBe('unauthorized');
        expect(JSON.stringify(first.body)).toContain('Account not found');
        expect(derivations).toBe(1);

        await request('/environment/1/records', ip, bearer);
        await request('/environment/1/records', ip, bearer);
        expect(derivations).toBe(1);
    });

    it('does not derive every distinct persist bearer from one IP', async () => {
        const ip = nextIp();
        const bearers = Array.from({ length: 8 }, () => crypto.randomUUID());

        const responses = await Promise.all(bearers.map((bearer) => request('/environment/1/records', ip, bearer)));
        for (const response of responses) {
            expect([401, 429]).toContain(response.status);
        }
        expect(derivations).toBeGreaterThan(0);
        expect(derivations).toBeLessThanOrEqual(MAX_UNKNOWN_BEARER_DERIVATIONS_PER_IP);
    });

    it('does not derive every non-uuid persist bearer from one IP', async () => {
        const ip = nextIp();
        const bearers = Array.from({ length: 8 }, (_, index) => `not-a-stored-key-${index}`);

        const responses = await Promise.all(bearers.map((bearer) => request('/environment/1/records', ip, bearer)));
        for (const response of responses) {
            expect([401, 429]).toContain(response.status);
        }
        expect(derivations).toBeGreaterThan(0);
        expect(derivations).toBeLessThanOrEqual(MAX_UNKNOWN_BEARER_DERIVATIONS_PER_IP);
    });

    it('passes PBKDF2_ITERATIONS through to the derivation used for a secret', async () => {
        const encryptionManager = await import('../../../shared/dist/utils/encryption.manager.js');
        const pbkdf2Spy = vi.spyOn(encryptionManager, 'pbkdf2');
        const bearer = crypto.randomUUID();

        const response = await request('/environments', nextIp(), bearer);

        expect(response.status).toBe(401);
        expect(response.body?.error?.code).toBe('unknown_account');
        expect(pbkdf2Spy).toHaveBeenCalled();
        expect(pbkdf2Spy.mock.calls[0]?.[2]).toBe(PBKDF2_ITERATIONS);
        pbkdf2Spy.mockRestore();
    });

    it('uses 310000 iterations when the process is not the vitest runner', () => {
        const encryptionSource = fileURLToPath(new URL('../../../utils/lib/encryption.ts', import.meta.url));
        const env = { ...process.env };
        delete env.VITEST;
        const result = spawnSync(
            process.execPath,
            [
                '--experimental-strip-types',
                '--no-warnings',
                '--input-type=module',
                '--eval',
                `import { PBKDF2_ITERATIONS } from ${JSON.stringify(encryptionSource)}; if (PBKDF2_ITERATIONS !== 310000) { console.log(PBKDF2_ITERATIONS); process.exit(2); }`
            ],
            { env, encoding: 'utf8' }
        );

        expect(result.status, result.stderr || result.stdout).toBe(0);
    });
});
