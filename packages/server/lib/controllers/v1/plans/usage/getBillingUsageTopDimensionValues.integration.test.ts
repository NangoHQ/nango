import { randomUUID } from 'crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders, updatePlan } from '@nangohq/shared';
import { Clickhouse, clickhouseClient, migrate as migrateClickhouse } from '@nangohq/usage';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

import type { UsageMetric } from '@nangohq/types';
import type { ClickhouseRawUsageEvent } from '@nangohq/usage';

const route = '/api/v1/plans/billing-usage/top-dimension-values';
let api: Awaited<ReturnType<typeof runServer>>;
let clickhouse: Clickhouse;

const day0 = new Date('2026-05-01T00:00:00.000Z');
const day1 = new Date('2026-05-02T00:00:00.000Z');
const end = new Date('2026-05-03T00:00:00.000Z');

// records on three integrations: a >> b >> c, so the top-dimension-values ordering is deterministic.
function seedFixture(accountId: number, environmentId: number): ClickhouseRawUsageEvent[] {
    const batch = randomUUID();
    const attrs = (integrationId: string) => ({ environmentId, integrationId, batchId: batch });
    return [
        { ts: day0.getTime(), type: 'usage.records', idempotency_key: randomUUID(), account_id: accountId, value: 1000, attributes: attrs('a') },
        { ts: day1.getTime(), type: 'usage.records', idempotency_key: randomUUID(), account_id: accountId, value: 2000, attributes: attrs('a') },
        { ts: day0.getTime(), type: 'usage.records', idempotency_key: randomUUID(), account_id: accountId, value: 500, attributes: attrs('b') },
        { ts: day1.getTime(), type: 'usage.records', idempotency_key: randomUUID(), account_id: accountId, value: 200, attributes: attrs('c') }
    ];
}

// One `records` event per (integration_id, value) — lets a test control the
// distinct value count and their volume ordering precisely.
function recordsFor(specs: { integrationId: string; value: number }[]) {
    return (accountId: number, environmentId: number): ClickhouseRawUsageEvent[] => {
        const batch = randomUUID();
        return specs.map((s) => ({
            ts: day0.getTime(),
            type: 'usage.records',
            idempotency_key: randomUUID(),
            account_id: accountId,
            value: s.value,
            attributes: { environmentId, integrationId: s.integrationId, batchId: batch }
        }));
    };
}

async function seedAccountWith(
    seedFn: (accountId: number, environmentId: number) => ClickhouseRawUsageEvent[]
): Promise<{ apiKey: { secret: string }; accountId: number; envId: number; envName: string }> {
    const { plan, apiKey, account, env } = await seeders.seedAccountEnvAndUser();
    await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123', orb_subscription_id: 'orb_sub_123' });
    clickhouse.addRaw(seedFn(account.id, env.id));
    await clickhouse.flush();
    return { apiKey, accountId: account.id, envId: env.id, envName: env.name };
}

function seedAccount(): Promise<{ apiKey: { secret: string }; accountId: number; envId: number; envName: string }> {
    return seedAccountWith(seedFixture);
}

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        const cleanupClient = clickhouseClient();
        await cleanupClient?.command({ query: `DROP DATABASE IF EXISTS usage` });
        await cleanupClient?.close();
        await migrateClickhouse({ database: 'usage' });
        clickhouse = new Clickhouse();
        api = await runServer();
    });

    afterAll(async () => {
        await clickhouse.shutdown({ timeoutMs: 5_000 });
        api.server.close();
    });

    describe('Authentication & validation', () => {
        it('should be protected', async () => {
            // @ts-expect-error missing required query params
            const res = await api.fetch(route, { query: { env: 'dev' } });
            shouldBeProtected(res);
        });

        it('rejects an unknown metric', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: {
                    env: 'dev',
                    metric: 'not_a_metric' as UsageMetric,
                    dimension: 'integration_id',
                    from: day0.toISOString(),
                    to: end.toISOString()
                }
            });
            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_query_params');
        });

        it('rejects a (metric, dimension) pair not in the whitelist', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: {
                    env: 'dev',
                    metric: 'connections',
                    dimension: 'model', // not exposed for connections — invalid on purpose
                    from: day0.toISOString(),
                    to: end.toISOString()
                } as any
            });
            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_query_params');
        });

        it('rejects when from > to', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: {
                    env: 'dev',
                    metric: 'records',
                    dimension: 'integration_id',
                    from: end.toISOString(),
                    to: day0.toISOString()
                }
            });
            isError(res.json);
            expect(res.res.status).toBe(400);
        });

        it('rejects an empty dimension', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: {
                    env: 'dev',
                    metric: 'records',
                    dimension: '', // empty dimension is invalid on purpose
                    from: day0.toISOString(),
                    to: end.toISOString()
                } as any
            });
            isError(res.json);
            expect(res.res.status).toBe(400);
        });
    });

    describe('Happy path', () => {
        it('returns top values ordered by SUM(value) DESC; label === id for slug dims', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: {
                    env: 'dev',
                    metric: 'records',
                    dimension: 'integration_id',
                    from: day0.toISOString(),
                    to: end.toISOString()
                }
            });
            isSuccess(res.json);
            expect(res.json.data.values).toEqual([
                { id: 'a', label: 'a' },
                { id: 'b', label: 'b' },
                { id: 'c', label: 'c' }
            ]);
            // Fewer than a full page → no next page.
            expect(res.json.data.pagination).toEqual({ page: 0, limit: 25, hasMore: false });
        });

        it('resolves environment_id to the env name (label) while keeping the raw id', async () => {
            const { apiKey, envId, envName } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: {
                    env: 'dev',
                    metric: 'records',
                    dimension: 'environment_id',
                    from: day0.toISOString(),
                    to: end.toISOString()
                }
            });
            isSuccess(res.json);
            expect(res.json.data.values).toEqual([{ id: String(envId), label: envName }]);
        });
    });

    describe('Search', () => {
        it('matches a case-insensitive substring across the full set, ranked by volume', async () => {
            const { apiKey } = await seedAccountWith(
                recordsFor([
                    { integrationId: 'Stripe', value: 1000 },
                    { integrationId: 'stripe-prod', value: 500 },
                    { integrationId: 'github', value: 800 }
                ])
            );
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: {
                    env: 'dev',
                    metric: 'records',
                    dimension: 'integration_id',
                    from: day0.toISOString(),
                    to: end.toISOString(),
                    search: 'strip'
                }
            });
            isSuccess(res.json);
            // Both stripe values (ranked by volume), github excluded — even though
            // github outranks stripe-prod, it doesn't match the search.
            expect(res.json.data.values).toEqual([
                { id: 'Stripe', label: 'Stripe' },
                { id: 'stripe-prod', label: 'stripe-prod' }
            ]);
            expect(res.json.data.pagination.hasMore).toBe(false);
        });

        it('returns no values when nothing matches', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: {
                    env: 'dev',
                    metric: 'records',
                    dimension: 'integration_id',
                    from: day0.toISOString(),
                    to: end.toISOString(),
                    search: 'no-such-integration'
                }
            });
            isSuccess(res.json);
            expect(res.json.data.values).toEqual([]);
            expect(res.json.data.pagination.hasMore).toBe(false);
        });

        it('ignores search for environment_id (still returns the env)', async () => {
            const { apiKey, envId, envName } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: {
                    env: 'dev',
                    metric: 'records',
                    dimension: 'environment_id',
                    from: day0.toISOString(),
                    to: end.toISOString(),
                    search: 'no-such-env'
                }
            });
            isSuccess(res.json);
            expect(res.json.data.values).toEqual([{ id: String(envId), label: envName }]);
            expect(res.json.data.pagination.hasMore).toBe(false);
        });
    });

    describe('Paging', () => {
        // 30 integrations with strictly descending volume → deterministic ranking int-00 … int-29.
        const descending = recordsFor(Array.from({ length: 30 }, (_, i) => ({ integrationId: `int-${String(i).padStart(2, '0')}`, value: 1000 - i })));
        const expectedOrder = Array.from({ length: 30 }, (_, i) => `int-${String(i).padStart(2, '0')}`);

        it('returns a full first page with hasMore, then the remainder', async () => {
            const { apiKey } = await seedAccountWith(descending);
            const page0 = await api.fetch(route, {
                token: apiKey.secret,
                query: { env: 'dev', metric: 'records', dimension: 'integration_id', from: day0.toISOString(), to: end.toISOString(), page: '0' }
            });
            isSuccess(page0.json);
            expect(page0.json.data.values.map((v) => v.id)).toEqual(expectedOrder.slice(0, 25));
            expect(page0.json.data.pagination).toEqual({ page: 0, limit: 25, hasMore: true });

            const page1 = await api.fetch(route, {
                token: apiKey.secret,
                query: { env: 'dev', metric: 'records', dimension: 'integration_id', from: day0.toISOString(), to: end.toISOString(), page: '1' }
            });
            isSuccess(page1.json);
            expect(page1.json.data.values.map((v) => v.id)).toEqual(expectedOrder.slice(25));
            expect(page1.json.data.pagination).toEqual({ page: 1, limit: 25, hasMore: false });
        });

        it('pages equal-ranked values disjointly and completely (stable tie-break)', async () => {
            // All 30 share the same volume, so only the `dim ASC` tie-break orders them.
            const tied = recordsFor(Array.from({ length: 30 }, (_, i) => ({ integrationId: `tie-${String(i).padStart(2, '0')}`, value: 100 })));
            const { apiKey } = await seedAccountWith(tied);
            const q = (page: string) => ({
                env: 'dev',
                metric: 'records' as const,
                dimension: 'integration_id' as const,
                from: day0.toISOString(),
                to: end.toISOString(),
                page
            });
            const page0 = await api.fetch(route, { token: apiKey.secret, query: q('0') });
            const page1 = await api.fetch(route, { token: apiKey.secret, query: q('1') });
            isSuccess(page0.json);
            isSuccess(page1.json);
            const ids0 = page0.json.data.values.map((v) => v.id);
            const ids1 = page1.json.data.values.map((v) => v.id);
            expect(ids0).toHaveLength(25);
            expect(ids1).toHaveLength(5);
            // No value skipped or duplicated across the page boundary.
            expect(new Set([...ids0, ...ids1]).size).toBe(30);
            expect(ids0.filter((id) => ids1.includes(id))).toEqual([]);
        });
    });
});
