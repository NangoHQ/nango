import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { seeders, updatePlan } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { authenticateUser, isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';
import { usageTracker } from '../../../../utils/usage.js';

import type { DBPlan } from '@nangohq/types';

const route = '/api/v1/plans/billing/projected-costs';
let api: Awaited<ReturnType<typeof runServer>>;

let getBillingUsageSpy: any;

const NOT_APPLICABLE = {
    metrics: {},
    subtotalInCents: 0,
    minimumInCents: 0,
    minimumApplied: false,
    growthAddOnInCents: 0,
    totalInCents: 0,
    periodComplete: false,
    currency: 'USD',
    notApplicable: true
};

// 34 connections, 64.3 hours of compute, 12.4 GB — the figures the design frame is drawn with.
const USAGE = {
    connections: { total: 34 },
    function_duration_seconds: { total: 231_480 },
    data_transfer: { total: 12_400_000_000 }
};

const IN_A_MONTH = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const LAST_MONTH = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

async function seedPlan(planName: DBPlan['name'], { futurePlan, futurePlanAt }: { futurePlan?: string | null; futurePlanAt?: Date | null } = {}) {
    const seed = await seeders.seedAccountEnvAndUser();
    // A silently failed update would test the seeded default plan and pass for the wrong reason.
    const updated = await updatePlan(db.knex, {
        id: seed.plan.id,
        name: planName,
        orb_future_plan: futurePlan ?? null,
        orb_future_plan_at: futurePlanAt ?? null
    });
    if (updated.isErr()) {
        throw updated.error;
    }
    return seed;
}

function scheduled(planName: DBPlan['name']) {
    return seedPlan(planName, { futurePlan: 'pay-as-you-go', futurePlanAt: IN_A_MONTH });
}

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
        getBillingUsageSpy = vi.spyOn(usageTracker, 'getBillingUsage');
    });

    afterAll(() => {
        api.server.close();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        getBillingUsageSpy.mockResolvedValue(Ok(USAGE));
    });

    describe('Authentication & Authorization', () => {
        it('should be protected', async () => {
            const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' } });

            shouldBeProtected(res);
        });

        it('should enforce env query param', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(route, {
                method: 'GET',
                token: apiKey.secret,
                // @ts-expect-error missing env on purpose
                query: {}
            });

            shouldRequireQueryEnv(res);
        });

        it.each([
            ['from', { from: '2026-08-01T00:00:00.000Z' }],
            ['to', { to: '2026-09-01T00:00:00.000Z' }]
        ])('should reject %s without its pair, rather than projecting the current period', async (_name, half) => {
            const { apiKey } = await scheduled('growth-v2');
            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev', ...half } });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(getBillingUsageSpy).not.toHaveBeenCalled();
        });

        it('should reject a timeframe that runs backwards', async () => {
            const { apiKey } = await scheduled('growth-v2');
            const res = await api.fetch(route, {
                method: 'GET',
                token: apiKey.secret,
                query: { env: 'dev', from: '2026-09-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_query_params');
        });
    });

    describe('Gating on the Orb schedule', () => {
        it('should not read usage for an account with nothing scheduled', async () => {
            const { apiKey } = await seedPlan('growth-v2');

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual(NOT_APPLICABLE);
            // No migration means no projection to make, so the read must not happen at all.
            expect(getBillingUsageSpy).not.toHaveBeenCalled();
        });

        it('should ignore a past-dated schedule, which nothing clears once the date passes', async () => {
            const { apiKey } = await seedPlan('growth-v2', { futurePlan: 'pay-as-you-go', futurePlanAt: LAST_MONTH });

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.json.data).toStrictEqual(NOT_APPLICABLE);
            expect(getBillingUsageSpy).not.toHaveBeenCalled();
        });

        it('should not open the staff preview to an ordinary signed-in session', async () => {
            // The preview turns on `debugMode`, which only `postImpersonate` sets and only for the
            // admin account. An account logging in normally must not reach its own projection.
            const seed = await seedPlan('growth-v2');
            const session = await authenticateUser(api, seed.user);

            const res = await api.fetch(route, { method: 'GET', session, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.json.data).toStrictEqual(NOT_APPLICABLE);
            expect(getBillingUsageSpy).not.toHaveBeenCalled();
        });

        it('should ignore a schedule that lands somewhere other than Pay-as-you-go', async () => {
            const { apiKey } = await seedPlan('growth-v2', { futurePlan: 'free', futurePlanAt: IN_A_MONTH });

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.json.data).toStrictEqual(NOT_APPLICABLE);
            expect(getBillingUsageSpy).not.toHaveBeenCalled();
        });

        // The retired plans fail both `isSpendPlan` and the old plan-name allowlist, yet they are
        // exactly who is being migrated — 7 starter-legacy accounts in the first batch.
        it.each(['starter-v2', 'growth-v2', 'starter-legacy', 'scale-legacy', 'growth-legacy'] as const)(
            'should project for a scheduled %s account',
            async (planName) => {
                const { apiKey } = await scheduled(planName);

                const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

                isSuccess(res.json);
                expect(res.res.status).toBe(200);
                expect(res.json.data.notApplicable).toBe(false);
                expect(res.json.data.metrics).toEqual({ connections: 986, function_duration_seconds: 4630, data_transfer: 620 });
                expect(res.json.data.subtotalInCents).toBe(6236);
                expect(getBillingUsageSpy).toHaveBeenCalled();
            }
        );
    });

    describe('The projected bill', () => {
        it('should carry the Growth add-on for growth-v2', async () => {
            const { apiKey } = await scheduled('growth-v2');

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.json.data.growthAddOnInCents).toBe(45_000);
            expect(res.json.data.totalInCents).toBe(51_236);
        });

        it('should leave the add-on out for starter-v2', async () => {
            const { apiKey } = await scheduled('starter-v2');

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.json.data.growthAddOnInCents).toBe(0);
            expect(res.json.data.totalInCents).toBe(6236);
        });

        it('should floor a light period at the minimum, leaving the rows alone', async () => {
            const { apiKey } = await scheduled('starter-v2');
            getBillingUsageSpy.mockResolvedValue(Ok({ connections: { total: 10 }, function_duration_seconds: { total: 0 }, data_transfer: { total: 0 } }));

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.json.data.metrics.connections).toBe(290);
            expect(res.json.data.subtotalInCents).toBe(290);
            expect(res.json.data.minimumApplied).toBe(true);
            expect(res.json.data.totalInCents).toBe(5000);
        });

        it('should keep a genuine zero as zero rather than a gap', async () => {
            const { apiKey } = await scheduled('starter-v2');
            getBillingUsageSpy.mockResolvedValue(Ok({}));

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.json.data.metrics).toEqual({ connections: 0, function_duration_seconds: 0, data_transfer: 0 });
            expect(res.json.data.subtotalInCents).toBe(0);
            expect(res.json.data.totalInCents).toBe(5000);
        });

        it('should pass the requested timeframe through to the usage read', async () => {
            const { apiKey } = await scheduled('growth-v2');

            await api.fetch(route, {
                method: 'GET',
                token: apiKey.secret,
                query: { env: 'dev', from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }
            });

            expect(getBillingUsageSpy).toHaveBeenCalledWith(
                '',
                expect.any(Number),
                expect.objectContaining({
                    granularity: 'day',
                    avgPerDay: true,
                    timeframe: { start: new Date('2026-08-01T00:00:00.000Z'), end: new Date('2026-09-01T00:00:00.000Z') }
                })
            );
        });

        it('should fail loudly when the usage read fails, rather than quoting a wrong bill', async () => {
            const { apiKey } = await scheduled('growth-v2');
            getBillingUsageSpy.mockResolvedValue(Err(new Error('clickhouse_down')));

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isError(res.json);
            expect(res.res.status).toBe(500);
        });
    });
});
