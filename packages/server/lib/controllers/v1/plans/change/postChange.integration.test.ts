import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { productTracking, seeders, updatePlan } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

import type { BillingSubscription } from '@nangohq/types';

const mockPaymentIntentsCreate = vi.fn();
vi.mock('@nangohq/billing', async () => {
    const actual = await vi.importActual('@nangohq/billing');
    const mockGetStripe = vi.fn(() => ({
        paymentIntents: {
            create: mockPaymentIntentsCreate
        }
    }));
    return {
        ...actual,
        getStripe: mockGetStripe
    };
});

const route = '/api/v1/plans/change';
let api: Awaited<ReturnType<typeof runServer>>;

// Create reusable spies
let getSubscriptionSpy: any;
let upgradeSpy: any;
let downgradeSpy: any;
let cancelPendingChangesSpy: any;
let productTrackingSpy: any;

describe(`POST ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();

        // Create spies once
        getSubscriptionSpy = vi.spyOn(billing, 'getSubscription');
        upgradeSpy = vi.spyOn(billing, 'upgrade');
        downgradeSpy = vi.spyOn(billing, 'downgrade');
        cancelPendingChangesSpy = vi.spyOn(billing.client, 'cancelPendingChanges');
        productTrackingSpy = vi.spyOn(productTracking, 'track');
    });

    afterAll(() => {
        api.server.close();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset spies to default implementations
        getSubscriptionSpy.mockResolvedValue(Ok(null));
        upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'pending_123', amountInCents: 5000 }));
        downgradeSpy.mockResolvedValue(Ok(undefined));
        cancelPendingChangesSpy.mockResolvedValue(Ok(undefined));
        productTrackingSpy.mockImplementation(() => {
            // no-op
        });
        mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_123', status: 'requires_payment_method' });
    });

    describe('Authentication & Authorization', () => {
        it('should be protected', async () => {
            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                body: { orbId: 'starter-v2' }
            });

            shouldBeProtected(res);
        });

        it('should enforce env query params', async () => {
            const { secret } = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(route, {
                method: 'POST',
                token: secret.secret,
                // @ts-expect-error missing env on purpose
                query: {},
                body: { orbId: 'starter-v2' }
            });

            shouldRequireQueryEnv(res);
        });
    });

    describe('Input Validation', () => {
        it('should validate body structure - missing orbId', async () => {
            const { secret } = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                // @ts-expect-error missing orbId on purpose
                body: {}
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should validate body structure - extra fields', async () => {
            const { secret } = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                // @ts-expect-error extra fields on purpose
                body: { orbId: 'starter-v2', extraField: 'invalid' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should validate orbId enum - invalid plan code', async () => {
            const { secret } = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'invalid-plan-code' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should reject empty query params', async () => {
            const { secret } = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(route, {
                method: 'POST',
                // @ts-expect-error invalidParam on purpose
                query: { env: 'dev', invalidParam: 'value' },
                token: secret.secret,
                body: { orbId: 'starter-v2' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_query_params');
        });
    });

    describe('Plan State Validation', () => {
        it('should reject if team has no orb subscription', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            // Ensure orb_subscription_id is null
            await updatePlan(db.knex, { id: plan.id, orb_subscription_id: null });

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'starter-v2' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({
                code: 'invalid_body',
                message: "team doesn't not have a subscription"
            });
        });

        it('should reject if plan cannot change', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            // Set plan to enterprise which has canChange: false
            await updatePlan(db.knex, {
                id: plan.id,
                name: 'enterprise',
                orb_subscription_id: 'sub_123'
            });

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'starter-v2' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({
                code: 'invalid_body',
                message: 'team cannot change plan'
            });
        });

        it('should reject if already on target plan', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            // Ensure plan has subscription
            await updatePlan(db.knex, { id: plan.id, orb_subscription_id: 'sub_123' });

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'free' } // Already on free plan
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({
                code: 'invalid_body',
                message: 'team is already on this plan'
            });
        });
    });

    describe('Subscription Validation', () => {
        it('should reject if subscription not found in Orb', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, orb_subscription_id: 'sub_123' });

            getSubscriptionSpy.mockResolvedValue(Ok(null));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'starter-v2' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({
                code: 'invalid_body',
                message: "team doesn't not have a subscription"
            });
        });

        it('should handle pending changes', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, {
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'plan_123',
                pendingChangeId: 'pending_123'
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            cancelPendingChangesSpy.mockResolvedValue(Ok(undefined));
            upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'new_pending_123', amountInCents: 5000 }));
            mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_123', status: 'requires_payment_method' });

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'starter-v2' }
            });

            expect(billing.client.cancelPendingChanges).toHaveBeenCalledWith({ pendingChangeId: 'pending_123' });
            isSuccess(res.json);
            expect(res.res.status).toBe(200);
        });
    });

    describe('Upgrade Flow', () => {
        it('should reject upgrade without Stripe linkage', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, {
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: null,
                stripe_payment_id: null
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'plan_123'
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'starter-v2' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({
                code: 'invalid_body',
                message: 'team is not linked to stripe'
            });
        });

        it('should create payment intent for upgrade', async () => {
            const { account, plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, {
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'plan_123'
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'pending_123', amountInCents: 5000 }));

            const mockPaymentIntent = { id: 'pi_123', status: 'requires_payment_method', client_secret: 'secret_123' };
            mockPaymentIntentsCreate.mockResolvedValue(mockPaymentIntent);

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'starter-v2' }
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toHaveProperty('paymentIntent');
            expect(mockPaymentIntentsCreate).toHaveBeenCalledWith({
                metadata: { accountUuid: account.uuid },
                amount: 5000,
                currency: 'usd',
                customer: 'cus_123',
                payment_method: 'pm_123'
            });
        });

        it('should return payment intent when not auto-confirmed', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, {
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'plan_123'
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'pending_123', amountInCents: 5000 }));

            const mockPaymentIntent = { id: 'pi_123', status: 'requires_action' };
            mockPaymentIntentsCreate.mockResolvedValue(mockPaymentIntent);

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'starter-v2' }
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toHaveProperty('paymentIntent');
            if ('paymentIntent' in res.json.data) {
                expect(res.json.data.paymentIntent.status).toBe('requires_action');
            }
        });

        it('should return success when payment auto-confirmed', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, {
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'plan_123'
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'pending_123', amountInCents: 5000 }));

            const mockPaymentIntent = { id: 'pi_123', status: 'succeeded' };
            mockPaymentIntentsCreate.mockResolvedValue(mockPaymentIntent);

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'starter-v2' }
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual({ success: true });
        });

        it('should cancel pending change on upgrade error', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, {
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'plan_123'
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'pending_123', amountInCents: 5000 }));
            cancelPendingChangesSpy.mockResolvedValue(Ok(undefined));
            mockPaymentIntentsCreate.mockRejectedValue(new Error('Stripe API error'));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'starter-v2' }
            });

            expect(cancelPendingChangesSpy).toHaveBeenCalledWith({ pendingChangeId: 'pending_123' });
            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
        });

        it('should handle upgrade billing service errors', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, {
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'plan_123'
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            upgradeSpy.mockResolvedValue(Err(new Error('Billing service error')));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'starter-v2' }
            });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
        });
    });

    describe('Downgrade Flow', () => {
        it('should allow downgrade to free without Stripe', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, {
                id: plan.id,
                name: 'starter-v2',
                orb_subscription_id: 'sub_123',
                stripe_customer_id: null,
                stripe_payment_id: null
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'plan_123'
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            downgradeSpy.mockResolvedValue(Ok(undefined));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'free' }
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual({ success: true });
        });

        it('should require Stripe for paid plan downgrade', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, {
                id: plan.id,
                name: 'growth-v2',
                orb_subscription_id: 'sub_123',
                stripe_customer_id: null,
                stripe_payment_id: null
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'plan_123'
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'starter-v2' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({
                code: 'invalid_body',
                message: 'team is not linked to stripe'
            });
        });

        it('should reject if already scheduled for downgrade', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, {
                id: plan.id,
                name: 'starter-v2',
                orb_subscription_id: 'sub_123',
                orb_future_plan: 'free'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'plan_123'
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'free' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({
                code: 'invalid_body',
                message: 'team is already scheduled to be downgraded'
            });
        });

        it('should successfully downgrade', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, {
                id: plan.id,
                name: 'starter-v2',
                orb_subscription_id: 'sub_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'plan_123'
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            downgradeSpy.mockResolvedValue(Ok(undefined));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'free' }
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual({ success: true });
        });

        it('should handle downgrade billing service errors', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, {
                id: plan.id,
                name: 'starter-v2',
                orb_subscription_id: 'sub_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'plan_123'
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            downgradeSpy.mockResolvedValue(Err(new Error('Billing service error')));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'free' }
            });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
        });
    });

    describe('Error Handling', () => {
        it('should handle billing service errors gracefully', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, {
                id: plan.id,
                orb_subscription_id: 'sub_123'
            });

            getSubscriptionSpy.mockResolvedValue(Err(new Error('Billing service error')));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'starter-v2' }
            });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
        });

        it('should handle Stripe API errors', async () => {
            const { plan, secret } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, {
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'plan_123'
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'pending_123', amountInCents: 5000 }));
            cancelPendingChangesSpy.mockResolvedValue(Ok(undefined));
            mockPaymentIntentsCreate.mockRejectedValue(new Error('Stripe API error'));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: secret.secret,
                body: { orbId: 'starter-v2' }
            });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
            expect(cancelPendingChangesSpy).toHaveBeenCalledWith({ pendingChangeId: 'pending_123' });
        });
    });
});
