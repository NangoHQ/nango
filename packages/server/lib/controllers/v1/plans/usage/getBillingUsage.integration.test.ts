import { randomUUID } from 'crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { seeders, updatePlan } from '@nangohq/shared';
import { Clickhouse, clickhouseClient, migrate as migrateClickhouse } from '@nangohq/usage';
import { Ok } from '@nangohq/utils';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

import type { BillingCustomer, UsageMetric } from '@nangohq/types';
import type { ClickhouseRawUsageEvent } from '@nangohq/usage';

const route = '/api/v1/plans/billing-usage';
let api: Awaited<ReturnType<typeof runServer>>;
let clickhouse: Clickhouse;
let getCustomerSpy: any;

const mockCustomer: BillingCustomer = {
    id: 'orb_cust_123',
    invoicingDetails: { legalEntityName: 'Acme', email: 'billing@acme.com', address: null, taxId: null },
    portalUrl: null
};

// Two-day window for the fixture (UTC, midnight-aligned).
const day0 = new Date('2026-05-01T00:00:00.000Z');
const day1 = new Date('2026-05-02T00:00:00.000Z');
const end = new Date('2026-05-03T00:00:00.000Z');

// Single shared batchId per (day, account) keeps the CH AVG `batches` denominator
// stable (`uniqExact(batch_id)`); we get batches=1 per day for records/connections.
function seedFixture(accountId: number): ClickhouseRawUsageEvent[] {
    const batchDay0 = randomUUID();
    const batchDay1 = randomUUID();
    const base = { environmentId: 1, environmentName: 'test' as const };
    return [
        // proxy — 10 success, 5 failure on day 0; 8 success on day 1
        {
            ts: day0.getTime(),
            type: 'usage.proxy',
            idempotency_key: randomUUID(),
            account_id: accountId,
            value: 10,
            attributes: { ...base, success: true, integrationId: 'hubspot', connectionId: 'c-h' }
        },
        {
            ts: day0.getTime(),
            type: 'usage.proxy',
            idempotency_key: randomUUID(),
            account_id: accountId,
            value: 5,
            attributes: { ...base, success: false, integrationId: 'hubspot', connectionId: 'c-h' }
        },
        {
            ts: day1.getTime(),
            type: 'usage.proxy',
            idempotency_key: randomUUID(),
            account_id: accountId,
            value: 8,
            attributes: { ...base, success: true, integrationId: 'salesforce', connectionId: 'c-s' }
        },
        // function_executions — 3 sync runs across days
        {
            ts: day0.getTime(),
            type: 'usage.function_executions',
            idempotency_key: randomUUID(),
            account_id: accountId,
            value: 2,
            attributes: {
                ...base,
                type: 'sync',
                functionName: 'f1',
                integrationId: 'hubspot',
                connectionId: 'c-h',
                runtime: 'lambda',
                telemetryBag: { durationMs: 100, customLogs: 0, proxyCalls: 0, memoryGb: 1 }
            }
        },
        {
            ts: day1.getTime(),
            type: 'usage.function_executions',
            idempotency_key: randomUUID(),
            account_id: accountId,
            value: 1,
            attributes: {
                ...base,
                type: 'sync',
                functionName: 'f1',
                integrationId: 'hubspot',
                connectionId: 'c-h',
                runtime: 'lambda',
                telemetryBag: { durationMs: 50, customLogs: 0, proxyCalls: 0, memoryGb: 1 }
            }
        },
        // webhook_forward — 4 events on day 0
        {
            ts: day0.getTime(),
            type: 'usage.webhook_forward',
            idempotency_key: randomUUID(),
            account_id: accountId,
            value: 4,
            attributes: { ...base, success: true, integrationId: 'hubspot', connectionId: 'c-h' }
        },
        // records — 1000 on day 0 (integration=hubspot), 500 on day 0 (integration=salesforce), 700 on day 1 (hubspot)
        {
            ts: day0.getTime(),
            type: 'usage.records',
            idempotency_key: randomUUID(),
            account_id: accountId,
            value: 1000,
            attributes: { environmentId: 1, integrationId: 'hubspot', connectionId: 'c-h', model: 'Contact', batchId: batchDay0 }
        },
        {
            ts: day0.getTime(),
            type: 'usage.records',
            idempotency_key: randomUUID(),
            account_id: accountId,
            value: 500,
            attributes: { environmentId: 1, integrationId: 'salesforce', connectionId: 'c-s', model: 'Lead', batchId: batchDay0 }
        },
        {
            ts: day1.getTime(),
            type: 'usage.records',
            idempotency_key: randomUUID(),
            account_id: accountId,
            value: 700,
            attributes: { environmentId: 1, integrationId: 'hubspot', connectionId: 'c-h', model: 'Contact', batchId: batchDay1 }
        },
        // connections — 50 active day 0, 80 active day 1
        {
            ts: day0.getTime(),
            type: 'usage.connections',
            idempotency_key: randomUUID(),
            account_id: accountId,
            value: 50,
            attributes: { environmentId: 1, integrationId: 'hubspot', batchId: batchDay0 }
        },
        {
            ts: day1.getTime(),
            type: 'usage.connections',
            idempotency_key: randomUUID(),
            account_id: accountId,
            value: 80,
            attributes: { environmentId: 1, integrationId: 'hubspot', batchId: batchDay1 }
        }
    ];
}

async function seedAccount(): Promise<{ apiKey: { secret: string }; accountId: number }> {
    const { plan, apiKey, account } = await seeders.seedAccountEnvAndUser();
    await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123', orb_subscription_id: 'orb_sub_123' });
    clickhouse.addRaw(seedFixture(account.id));
    await clickhouse.flush();
    return { apiKey, accountId: account.id };
}

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        // Reset the shared `usage` CH database used by the server's Clickhouse
        // instance so the seeded fixture is the only data the queries see.
        const cleanupClient = clickhouseClient();
        await cleanupClient?.command({ query: `DROP DATABASE IF EXISTS usage` });
        await cleanupClient?.close();
        await migrateClickhouse({ database: 'usage' });
        clickhouse = new Clickhouse();

        api = await runServer();
        getCustomerSpy = vi.spyOn(billing, 'getCustomer');
    });

    afterAll(async () => {
        await clickhouse.shutdown({ timeoutMs: 5_000 });
        api.server.close();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        getCustomerSpy.mockResolvedValue(Ok(mockCustomer));
    });

    describe('Authentication & validation', () => {
        it('should be protected', async () => {
            const res = await api.fetch(route, { query: { env: 'dev' } });
            shouldBeProtected(res);
        });

        it('should enforce env query param', async () => {
            const { apiKey } = await seedAccount();
            // @ts-expect-error missing env on purpose
            const res = await api.fetch(route, { token: apiKey.secret, query: {} });
            shouldRequireQueryEnv(res);
        });

        it('rejects an unknown source', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                // @ts-expect-error invalid source
                query: { env: 'dev', source: 'not-a-source' }
            });
            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_query_params');
        });

        it('rejects an unknown metric in the CSV', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: { env: 'dev', metrics: 'records,unknown_metric' }
            });
            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_query_params');
        });

        it('rejects a breakdown entry with a dimension invalid for the metric', async () => {
            const { apiKey } = await seedAccount();
            // `connections` does not support `connection_id` (the metric IS the count of connections)
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: { env: 'dev', breakdown: { connections: 'connection_id' } } as any
            });
            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_query_params');
        });

        it('rejects an empty breakdown value (avoid silent "no breakdown" downstream)', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: { env: 'dev', breakdown: { records: '' } } as any
            });
            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_query_params');
        });
    });

    describe('ClickHouse happy path (source=clickhouse)', () => {
        it('returns all 7 metrics populated from the seeded CH data', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: { env: 'dev', from: day0.toISOString(), to: end.toISOString(), source: 'clickhouse' }
            });
            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            const usage = res.json.data.usage;

            // All 7 metrics in the response.
            expect(usage.proxy.total).toBe(23); // 10 + 5 + 8
            expect(usage.function_executions.total).toBe(3); // 2 + 1
            expect(usage.function_compute_gbms.total).toBeGreaterThanOrEqual(0);
            expect(usage.function_logs.total).toBe(0); // no custom_logs in fixture
            expect(usage.webhook_forwards.total).toBe(4);
            // records: AVG(per-batch sum) running across the window.
            // day 0: sum=1500, batches=1; day 1: sum=700, batches=1.
            // running avg after day 0 = 1500; after day 1 = (1500+700)/2 = 1100.
            // `total` is the formatter's final-day running avg = 1100.
            expect(usage.records.total).toBe(1100);
            // connections: day 0 sum=50, day 1 sum=80, running avg after day 1 = 65.
            expect(usage.connections.total).toBe(65);

            // No breakdown was requested, so no metric should carry a breakdown array.
            for (const metric of Object.values(usage)) {
                expect(metric.breakdown).toBeUndefined();
            }
        });

        it('scopes the response via metrics=records,connections', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: { env: 'dev', from: day0.toISOString(), to: end.toISOString(), source: 'clickhouse', metrics: 'records,connections' }
            });
            isSuccess(res.json);
            const usage = res.json.data.usage;
            // The 5 unrequested metrics come back as the empty placeholder shape
            // produced by `toApiBillingUsageMetric` when no source data exists —
            // total=0, usage=[]. Verifies the CH path did NOT fan out for them.
            const counterMetrics: UsageMetric[] = ['proxy', 'function_executions', 'function_logs', 'function_compute_gbms', 'webhook_forwards'];
            for (const m of counterMetrics) {
                expect(usage[m].total).toBe(0);
                expect(usage[m].usage).toEqual([]);
            }
            expect(usage.records.total).toBe(1100);
            expect(usage.connections.total).toBe(65);
        });

        it('records by integration_id — breakdown array with one entry per integration', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: {
                    env: 'dev',
                    from: day0.toISOString(),
                    to: end.toISOString(),
                    source: 'clickhouse',
                    metrics: 'records',
                    breakdown: { records: 'integration_id' }
                } as any
            });
            isSuccess(res.json);
            const records = res.json.data.usage.records;
            // Breakdown-only response contract: when breakdown is requested,
            // the top-level series is empty and only `breakdown` carries data.
            expect(records.usage).toEqual([]);
            expect(records.total).toBe(0);
            expect(records.breakdown).toBeDefined();
            expect(records.breakdown!.length).toBeGreaterThanOrEqual(2);
            const groups = records.breakdown!.map((b) => b.group!.value).sort();
            // hubspot + salesforce in the fixture; both should be in the top-N.
            expect(groups).toEqual(expect.arrayContaining(['hubspot', 'salesforce']));
            for (const series of records.breakdown!) {
                expect(series.group!.key).toBe('integration_id');
            }
        });

        it('proxy by success — counter-metric breakdown array', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: {
                    env: 'dev',
                    from: day0.toISOString(),
                    to: end.toISOString(),
                    source: 'clickhouse',
                    metrics: 'proxy',
                    breakdown: { proxy: 'success' }
                } as any
            });
            isSuccess(res.json);
            const proxy = res.json.data.usage.proxy;
            expect(proxy.usage).toEqual([]);
            expect(proxy.total).toBe(0);
            expect(proxy.breakdown).toBeDefined();
            const groups = proxy.breakdown!.map((b) => b.group!.value).sort();
            expect(groups).toEqual(['false', 'true']);
            for (const series of proxy.breakdown!) {
                expect(series.group!.key).toBe('success');
            }
        });

        it('respects top — only N+1 series come back when distinct values exceed top', async () => {
            const { apiKey } = await seedAccount();
            const res = await api.fetch(route, {
                token: apiKey.secret,
                query: {
                    env: 'dev',
                    from: day0.toISOString(),
                    to: end.toISOString(),
                    source: 'clickhouse',
                    metrics: 'records',
                    breakdown: { records: 'integration_id' },
                    top: '1'
                } as any
            });
            isSuccess(res.json);
            const breakdown = res.json.data.usage.records.breakdown!;
            // top=1 + 'rest' = up to 2 entries
            expect(breakdown.length).toBeLessThanOrEqual(2);
            const groups = breakdown.map((b) => b.group!.value);
            expect(groups).toContain('rest');
        });
    });
});
