import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { seeders, updatePlan } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

const route = '/api/v1/plans/billing/upcoming-invoice';
let api: Awaited<ReturnType<typeof runServer>>;

let getUpcomingInvoiceSpy: any;

/** Seeds an account on `planName` with a linked Orb subscription, and returns its api key. */
async function seedPlan(planName: string, { subscriptionId = 'orb_sub_123' }: { subscriptionId?: string | null } = {}) {
    const seed = await seeders.seedAccountEnvAndUser();
    // The whole suite asserts on plan gating, so a silently failed update would test the seeded
    // default plan instead and pass for the wrong reason.
    const updated = await updatePlan(db.knex, { id: seed.plan.id, name: planName as any, orb_subscription_id: subscriptionId });
    if (updated.isErr()) {
        throw updated.error;
    }
    return seed;
}

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
        getUpcomingInvoiceSpy = vi.spyOn(billing, 'getUpcomingInvoice');
    });

    afterAll(() => {
        api.server.close();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        getUpcomingInvoiceSpy.mockResolvedValue(Ok({ amountInCents: 128430, currency: 'USD' }));
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
            expect(res.json.data).toStrictEqual({ amountInCents: null, currency: null });
            // The gate exists to keep a non-monthly plan's contract total off this endpoint, so
            // "returned null" is not enough — the call must not happen at all.
            expect(getUpcomingInvoiceSpy).not.toHaveBeenCalled();
        });

        it.each(['starter-v2', 'growth-v2', 'startup-deal'])('should return the upcoming amount on %s', async (planName) => {
            const { apiKey } = await seedPlan(planName);

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual({ amountInCents: 128430, currency: 'USD' });
            expect(getUpcomingInvoiceSpy).toHaveBeenCalledWith('orb_sub_123');
        });

        it('should report zero rather than falling back — the startup deal really does bill $0.00', async () => {
            const { apiKey } = await seedPlan('startup-deal');
            getUpcomingInvoiceSpy.mockResolvedValue(Ok({ amountInCents: 0, currency: 'USD' }));

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.json.data).toStrictEqual({ amountInCents: 0, currency: 'USD' });
        });
    });

    describe('Orb responses', () => {
        it('should return null when Orb has no drafted invoice', async () => {
            const { apiKey } = await seedPlan('starter-v2');
            getUpcomingInvoiceSpy.mockResolvedValue(Ok(null));

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.json.data).toStrictEqual({ amountInCents: null, currency: null });
        });

        it('should 500 when the Orb read fails', async () => {
            const { apiKey } = await seedPlan('starter-v2');
            getUpcomingInvoiceSpy.mockResolvedValue(Err(new Error('failed_to_get_upcoming_invoice')));

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
        });

        it('should report no figure when a spend plan has no linked subscription', async () => {
            // Reachable before the Orb link exists, so it degrades rather than erroring.
            const { apiKey } = await seedPlan('starter-v2', { subscriptionId: null });

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual({ amountInCents: null, currency: null });
            expect(getUpcomingInvoiceSpy).not.toHaveBeenCalled();
        });
    });
});
