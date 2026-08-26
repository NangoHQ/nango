import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { seeders, updatePlan } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

const route = '/api/v1/plans/billing/period-costs';
let api: Awaited<ReturnType<typeof runServer>>;

let getPeriodCostsSpy: any;

const NO_COSTS = { metrics: {}, malformedMetrics: [], fullyAttributed: true, currency: null, noCosts: true };
const COSTS = {
    metrics: { records: 2317, connections: 0 },
    malformedMetrics: [],
    fullyAttributed: true,
    currency: 'USD',
    noCosts: false
};

async function seedPlan(planName: string, { subscriptionId = 'orb_sub_123' }: { subscriptionId?: string | null } = {}) {
    const seed = await seeders.seedAccountEnvAndUser();
    // A silently failed update would test the seeded default plan and pass for the wrong reason.
    const updated = await updatePlan(db.knex, { id: seed.plan.id, name: planName as any, orb_subscription_id: subscriptionId });
    if (updated.isErr()) {
        throw updated.error;
    }
    return seed;
}

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
        getPeriodCostsSpy = vi.spyOn(billing, 'getPeriodCosts');
    });

    afterAll(() => {
        api.server.close();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        getPeriodCostsSpy.mockResolvedValue(Ok(COSTS));
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

        it('should reject extra params in query', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(route, {
                method: 'GET',
                token: apiKey.secret,
                // @ts-expect-error extra param on purpose
                query: { env: 'dev', foo: 'bar' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_query_params');
        });
    });

    describe('Plan gating', () => {
        it.each(['free', 'free-uncapped', 'enterprise'])('should not call Orb on %s', async (planName) => {
            const { apiKey } = await seedPlan(planName);

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual(NO_COSTS);
            // These plans are rated outside the standard price set, so "returned nothing" is not
            // enough — the call must not happen at all.
            expect(getPeriodCostsSpy).not.toHaveBeenCalled();
        });

        it.each(['starter-v2', 'growth-v2', 'startup-deal'])('should return per-metric charges on %s', async (planName) => {
            const { apiKey } = await seedPlan(planName);

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual(COSTS);
            expect(getPeriodCostsSpy).toHaveBeenCalledWith('orb_sub_123');
        });

        it('should keep a zero charge as zero — the startup deal really does bill $0.00', async () => {
            const { apiKey } = await seedPlan('startup-deal');
            getPeriodCostsSpy.mockResolvedValue(Ok({ metrics: { records: 0 }, malformedMetrics: [], fullyAttributed: true, currency: 'USD' }));

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.json.data).toStrictEqual({
                metrics: { records: 0 },
                malformedMetrics: [],
                fullyAttributed: true,
                currency: 'USD',
                noCosts: false
            });
        });
    });

    describe('Orb responses', () => {
        it('should report no figures when Orb has no current period', async () => {
            const { apiKey } = await seedPlan('starter-v2');
            getPeriodCostsSpy.mockResolvedValue(Ok(null));

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.json.data).toStrictEqual(NO_COSTS);
        });

        it('passes through fullyAttributed and malformedMetrics so the caller knows which figures to trust', async () => {
            const { apiKey } = await seedPlan('growth-v2');
            getPeriodCostsSpy.mockResolvedValue(Ok({ metrics: { records: 100 }, malformedMetrics: ['proxy'], fullyAttributed: false, currency: 'USD' }));

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.json.data).toStrictEqual({
                metrics: { records: 100 },
                malformedMetrics: ['proxy'],
                fullyAttributed: false,
                currency: 'USD',
                noCosts: false
            });
        });

        it('should 500 when the Orb read fails', async () => {
            const { apiKey } = await seedPlan('starter-v2');
            getPeriodCostsSpy.mockResolvedValue(Err(new Error('failed_to_get_period_costs')));

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
        });

        it('should report no figures when a spend plan has no linked subscription', async () => {
            // Reachable before the Orb link exists, so it degrades rather than erroring.
            const { apiKey } = await seedPlan('starter-v2', { subscriptionId: null });

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual(NO_COSTS);
            expect(getPeriodCostsSpy).not.toHaveBeenCalled();
        });
    });
});
