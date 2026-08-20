import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { seeders, updatePlan } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

const route = '/api/v1/plans/billing/spend-alert';
let api: Awaited<ReturnType<typeof runServer>>;

let getSpendAlertSpy: any;
let setSpendAlertSpy: any;
let removeSpendAlertSpy: any;
let getUpcomingInvoiceSpy: any;

/** Seeds an account on `planName` with a linked Orb subscription, and returns its api key. */
async function seedPlan(planName: string, { subscriptionId = 'orb_sub_123' }: { subscriptionId?: string | null } = {}) {
    const seed = await seeders.seedAccountEnvAndUser();
    // The suite asserts on plan gating, so a silently failed update would test the seeded default
    // plan instead and pass for the wrong reason.
    const updated = await updatePlan(db.knex, { id: seed.plan.id, name: planName as any, orb_subscription_id: subscriptionId });
    if (updated.isErr()) {
        throw updated.error;
    }
    return seed;
}

beforeAll(async () => {
    api = await runServer();
    getSpendAlertSpy = vi.spyOn(billing, 'getSpendAlert');
    setSpendAlertSpy = vi.spyOn(billing, 'setSpendAlert');
    removeSpendAlertSpy = vi.spyOn(billing, 'removeSpendAlert');
    getUpcomingInvoiceSpy = vi.spyOn(billing, 'getUpcomingInvoice');
});

afterAll(() => {
    api.server.close();
});

beforeEach(() => {
    vi.clearAllMocks();
    getSpendAlertSpy.mockResolvedValue(Ok({ id: 'alert_1', thresholdInCents: 5000, currency: 'USD' }));
    setSpendAlertSpy.mockResolvedValue(Ok({ id: 'alert_1', thresholdInCents: 5000, currency: 'USD' }));
    removeSpendAlertSpy.mockResolvedValue(Ok(undefined));
    getUpcomingInvoiceSpy.mockResolvedValue(Ok({ amountInCents: 128430, currency: 'USD' }));
});

describe(`GET ${route}`, () => {
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
            expect(res.json.data).toStrictEqual({ thresholdInCents: null, currency: null });
            expect(getSpendAlertSpy).not.toHaveBeenCalled();
        });

        it.each(['starter-v2', 'growth-v2', 'startup-deal'])('should return the threshold on %s', async (planName) => {
            const { apiKey } = await seedPlan(planName);

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual({ thresholdInCents: 5000, currency: 'USD' });
            expect(getSpendAlertSpy).toHaveBeenCalledWith('orb_sub_123');
        });
    });

    describe('Orb responses', () => {
        it('should fall back to the draft invoice for a currency when no alert is set', async () => {
            const { apiKey } = await seedPlan('starter-v2');
            getSpendAlertSpy.mockResolvedValue(Ok(null));

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            // The dialog still needs to know which currency a threshold would be set in.
            expect(res.json.data).toStrictEqual({ thresholdInCents: null, currency: 'USD' });
        });

        it('should still answer when the currency fallback fails', async () => {
            const { apiKey } = await seedPlan('starter-v2');
            getSpendAlertSpy.mockResolvedValue(Ok(null));
            getUpcomingInvoiceSpy.mockResolvedValue(Err(new Error('failed_to_get_upcoming_invoice')));

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isSuccess(res.json);
            expect(res.json.data).toStrictEqual({ thresholdInCents: null, currency: null });
        });

        it('should not spend a call on the currency fallback when an alert exists', async () => {
            const { apiKey } = await seedPlan('starter-v2');

            await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            expect(getUpcomingInvoiceSpy).not.toHaveBeenCalled();
        });

        it('should 500 when the Orb read fails', async () => {
            const { apiKey } = await seedPlan('starter-v2');
            getSpendAlertSpy.mockResolvedValue(Err(new Error('failed_to_get_spend_alert')));

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
        });

        it('should 500 when a spend plan has no linked subscription', async () => {
            const { apiKey } = await seedPlan('starter-v2', { subscriptionId: null });

            const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' } });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(getSpendAlertSpy).not.toHaveBeenCalled();
        });
    });
});

describe(`PUT ${route}`, () => {
    describe('Authentication & Authorization', () => {
        it('should be protected', async () => {
            const res = await api.fetch(route, { method: 'PUT', query: { env: 'dev' }, body: { thresholdInCents: 5000 } });

            shouldBeProtected(res);
        });

        it('should enforce env query param', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(route, {
                method: 'PUT',
                token: apiKey.secret,
                // @ts-expect-error missing env on purpose
                query: {},
                body: { thresholdInCents: 5000 }
            });

            shouldRequireQueryEnv(res);
        });
    });

    describe('Validation', () => {
        it.each([
            ['a zero threshold', { thresholdInCents: 0 }],
            ['a negative threshold', { thresholdInCents: -5000 }],
            ['a fractional cent', { thresholdInCents: 50.5 }],
            ['an amount past the ceiling', { thresholdInCents: 1_000_000_001 }],
            ['a missing threshold', {}],
            ['an unknown field', { thresholdInCents: 5000, foo: 'bar' }]
        ])('should reject %s', async (_label, body) => {
            const { apiKey } = await seedPlan('starter-v2');

            const res = await api.fetch(route, { method: 'PUT', token: apiKey.secret, query: { env: 'dev' }, body: body as any });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
            expect(setSpendAlertSpy).not.toHaveBeenCalled();
        });
    });

    describe('Plan gating', () => {
        it.each(['free', 'enterprise'])('should refuse to set a threshold on %s', async (planName) => {
            const { apiKey } = await seedPlan(planName);

            const res = await api.fetch(route, { method: 'PUT', token: apiKey.secret, query: { env: 'dev' }, body: { thresholdInCents: 5000 } });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('feature_disabled');
            expect(setSpendAlertSpy).not.toHaveBeenCalled();
        });
    });

    it('should save the threshold and echo it back', async () => {
        const { apiKey } = await seedPlan('starter-v2');

        const res = await api.fetch(route, { method: 'PUT', token: apiKey.secret, query: { env: 'dev' }, body: { thresholdInCents: 5000 } });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json.data).toStrictEqual({ thresholdInCents: 5000, currency: 'USD' });
        expect(setSpendAlertSpy).toHaveBeenCalledWith('orb_sub_123', { thresholdInCents: 5000 });
    });

    it('should 500 when the Orb write fails', async () => {
        const { apiKey } = await seedPlan('starter-v2');
        setSpendAlertSpy.mockResolvedValue(Err(new Error('failed_to_set_spend_alert')));

        const res = await api.fetch(route, { method: 'PUT', token: apiKey.secret, query: { env: 'dev' }, body: { thresholdInCents: 5000 } });

        isError(res.json);
        expect(res.res.status).toBe(500);
        expect(res.json.error.code).toBe('server_error');
    });
});

describe(`DELETE ${route}`, () => {
    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'DELETE', query: { env: 'dev' } });

        shouldBeProtected(res);
    });

    it('should remove the threshold', async () => {
        const { apiKey } = await seedPlan('starter-v2');

        const res = await api.fetch(route, { method: 'DELETE', token: apiKey.secret, query: { env: 'dev' } });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(removeSpendAlertSpy).toHaveBeenCalledWith('orb_sub_123');
    });

    it('should still remove a threshold on a plan that has left the allowlist', async () => {
        // A plan change shouldn't be what stops someone clearing an alert they already set.
        const { apiKey } = await seedPlan('enterprise');

        const res = await api.fetch(route, { method: 'DELETE', token: apiKey.secret, query: { env: 'dev' } });

        isSuccess(res.json);
        expect(removeSpendAlertSpy).toHaveBeenCalledWith('orb_sub_123');
    });

    it('should succeed without calling Orb when there is no subscription', async () => {
        const { apiKey } = await seedPlan('starter-v2', { subscriptionId: null });

        const res = await api.fetch(route, { method: 'DELETE', token: apiKey.secret, query: { env: 'dev' } });

        isSuccess(res.json);
        expect(removeSpendAlertSpy).not.toHaveBeenCalled();
    });

    it('should 500 when the Orb write fails', async () => {
        const { apiKey } = await seedPlan('starter-v2');
        removeSpendAlertSpy.mockResolvedValue(Err(new Error('failed_to_remove_spend_alert')));

        const res = await api.fetch(route, { method: 'DELETE', token: apiKey.secret, query: { env: 'dev' } });

        isError(res.json);
        expect(res.res.status).toBe(500);
    });
});
