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

async function seedAccount(): Promise<{ apiKey: { secret: string }; accountId: number; envId: number; envName: string }> {
    const { plan, apiKey, account, env } = await seeders.seedAccountEnvAndUser();
    await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123', orb_subscription_id: 'orb_sub_123' });
    clickhouse.addRaw(seedFixture(account.id, env.id));
    await clickhouse.flush();
    return { apiKey, accountId: account.id, envId: env.id, envName: env.name };
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
        });

        it('honours limit', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: {
                    env: 'dev',
                    metric: 'records',
                    dimension: 'integration_id',
                    from: day0.toISOString(),
                    to: end.toISOString(),
                    limit: '2'
                }
            });
            isSuccess(res.json);
            expect(res.json.data.values).toEqual([
                { id: 'a', label: 'a' },
                { id: 'b', label: 'b' }
            ]);
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
});
