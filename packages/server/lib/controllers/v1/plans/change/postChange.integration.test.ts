import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { getPlan, productTracking, seeders, updatePlan } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { authenticateUser, isError, isSuccess, runServer, shouldBeProtected, shouldRequireSessionEnv } from '../../../../utils/tests.js';

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

async function setupPlan(data: Parameters<typeof updatePlan>[1]): Promise<void> {
    (await updatePlan(db.knex, data)).unwrap();
}

const route = '/api/v1/plans/change';
let api: Awaited<ReturnType<typeof runServer>>;

// Create reusable spies
let getSubscriptionSpy: any;
let upgradeSpy: any;
let downgradeSpy: any;
let startGrowthAddonSpy: any;
let endGrowthAddonSpy: any;
let cancelPendingChangesSpy: any;
let applyPendingChangesSpy: any;
let productTrackingSpy: any;

describe(`POST ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();

        // Create spies once
        getSubscriptionSpy = vi.spyOn(billing, 'getSubscription');
        upgradeSpy = vi.spyOn(billing, 'upgrade');
        downgradeSpy = vi.spyOn(billing, 'downgrade');
        startGrowthAddonSpy = vi.spyOn(billing, 'startGrowthAddon');
        endGrowthAddonSpy = vi.spyOn(billing, 'endGrowthAddon');
        cancelPendingChangesSpy = vi.spyOn(billing.client, 'cancelPendingChanges');
        applyPendingChangesSpy = vi.spyOn(billing.client, 'applyPendingChanges');
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
        startGrowthAddonSpy.mockResolvedValue(Ok({ priceIntervalId: 'pi_growth' }));
        endGrowthAddonSpy.mockResolvedValue(Ok({ growthFeaturesEndsAt: new Date('2026-10-01T00:00:00Z') }));
        cancelPendingChangesSpy.mockResolvedValue(Ok(undefined));
        applyPendingChangesSpy.mockResolvedValue(
            Ok({ id: 'sub_123', planExternalId: 'pay-as-you-go', hasGrowthFeatures: false, growthFeaturesEndsAt: null, growthFeaturesPriceIntervalId: null })
        );
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
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            shouldBeProtected(res);
        });

        it('should enforce env query params', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            const res = await api.fetch(route, {
                method: 'POST',
                session,
                // @ts-expect-error missing env on purpose
                query: {},
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            shouldRequireSessionEnv(res);
        });
    });

    describe('Input Validation', () => {
        it('should validate body structure - missing orbId', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                // @ts-expect-error missing orbId on purpose
                body: {}
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should validate body structure - extra fields', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                // @ts-expect-error extra fields on purpose
                body: { orbId: 'starter-v2', withGrowthFeatures: false, extraField: 'invalid' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should validate orbId enum - invalid plan code', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'invalid-plan-code', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should reject empty query params', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            const res = await api.fetch(route, {
                method: 'POST',
                // @ts-expect-error invalidParam on purpose
                query: { env: 'dev', invalidParam: 'value' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_query_params');
        });
    });

    describe('Plan State Validation', () => {
        it('should reject if team has no orb subscription', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            // Ensure orb_subscription_id is null
            await setupPlan({ id: plan.id, orb_subscription_id: null });

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({
                code: 'invalid_body',
                message: 'team does not have a subscription'
            });
        });

        it('should reject if plan cannot change', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            // Set plan to enterprise which has canChange: false
            await setupPlan({
                id: plan.id,
                name: 'enterprise',
                orb_subscription_id: 'sub_123'
            });

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({
                code: 'invalid_body',
                message: 'team cannot change plan'
            });
        });

        it('should reject if already on target plan', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            // Ensure plan has subscription
            await setupPlan({ id: plan.id, orb_subscription_id: 'sub_123' });
            getSubscriptionSpy.mockResolvedValue(
                Ok({
                    id: 'sub_123',
                    planExternalId: 'free',
                    hasGrowthFeatures: false,
                    growthFeaturesEndsAt: null,
                    growthFeaturesPriceIntervalId: null
                } satisfies BillingSubscription)
            );

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'free', withGrowthFeatures: false } // Already on free plan
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
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({ id: plan.id, orb_subscription_id: 'sub_123' });

            getSubscriptionSpy.mockResolvedValue(Err(new Error('failed_to_get_subscription', { cause: 'no subscription' })));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error).toStrictEqual({
                code: 'server_error'
            });
        });

        it('should handle pending changes', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'free',
                pendingChangeId: 'pending_123',
                hasGrowthFeatures: false,
                growthFeaturesEndsAt: null,
                growthFeaturesPriceIntervalId: null
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            cancelPendingChangesSpy.mockResolvedValue(Ok(undefined));
            upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'new_pending_123', amountInCents: 5000 }));
            mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_123', status: 'requires_payment_method' });

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            expect(billing.client.cancelPendingChanges).toHaveBeenCalledWith({ pendingChangeId: 'pending_123' });
            isSuccess(res.json);
            expect(res.res.status).toBe(200);
        });
    });

    describe('Upgrade Flow', () => {
        it('should reject an upgrade from starter-v2 to growth-v2', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                name: 'starter-v2',
                orb_subscription_id: 'sub_123'
            });

            // Orb and the DB have to agree on the current plan, otherwise the sync guard rejects the
            // request before it ever reaches the transition check this test is about
            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'starter-v2',
                hasGrowthFeatures: false,
                growthFeaturesEndsAt: null,
                growthFeaturesPriceIntervalId: null
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'growth-v2', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({
                code: 'invalid_body',
                message: 'team cannot change to this plan'
            });
        });

        it('should reject upgrade without Stripe linkage', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: null,
                stripe_payment_id: null
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'free',
                hasGrowthFeatures: false,
                growthFeaturesEndsAt: null,
                growthFeaturesPriceIntervalId: null
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({
                code: 'invalid_body',
                message: 'team is not linked to stripe'
            });
        });

        it('should create payment intent for upgrade', async () => {
            const { account, plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'free',
                hasGrowthFeatures: false,
                growthFeaturesEndsAt: null,
                growthFeaturesPriceIntervalId: null
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'pending_123', amountInCents: 5000 }));

            const mockPaymentIntent = { id: 'pi_123', status: 'requires_payment_method', client_secret: 'secret_123' };
            mockPaymentIntentsCreate.mockResolvedValue(mockPaymentIntent);

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
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
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'free',
                hasGrowthFeatures: false,
                growthFeaturesEndsAt: null,
                growthFeaturesPriceIntervalId: null
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'pending_123', amountInCents: 5000 }));

            const mockPaymentIntent = { id: 'pi_123', status: 'requires_action' };
            mockPaymentIntentsCreate.mockResolvedValue(mockPaymentIntent);

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toHaveProperty('paymentIntent');
            if ('paymentIntent' in res.json.data) {
                expect(res.json.data.paymentIntent.status).toBe('requires_action');
            }
        });

        it('should return success when payment auto-confirmed', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'free',
                hasGrowthFeatures: false,
                growthFeaturesEndsAt: null,
                growthFeaturesPriceIntervalId: null
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'pending_123', amountInCents: 5000 }));

            const mockPaymentIntent = { id: 'pi_123', status: 'succeeded' };
            mockPaymentIntentsCreate.mockResolvedValue(mockPaymentIntent);

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual({ success: true });
        });

        it('should apply the pending change without a payment when nothing is payable now', async () => {
            // A plan billed fully in arrears has no base fee to charge when the change is applied, so Orb
            // reports nothing payable now. Stripe should not be involved.
            const { account, plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            getSubscriptionSpy.mockResolvedValue(
                Ok({
                    id: 'sub_123',
                    planExternalId: 'free',
                    hasGrowthFeatures: false,
                    growthFeaturesEndsAt: null,
                    growthFeaturesPriceIntervalId: null
                } satisfies BillingSubscription)
            );
            upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'pending_123', amountInCents: null }));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'pay-as-you-go', withGrowthFeatures: false }
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual({ success: true });

            // No card charged, and Orb told there was nothing collected
            expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
            expect(applyPendingChangesSpy).toHaveBeenCalledWith({ pendingChangeId: 'pending_123' });

            // The plan is switched inline rather than waiting on a webhook that will never fire
            const updated = (await getPlan(db.knex, { accountId: account.id })).unwrap();
            expect(updated.name).toBe('pay-as-you-go');
            expect(updated.orb_subscription_id).toBe('sub_123');
        });

        it('should leave the pending change alone on upgrade error', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'free',
                hasGrowthFeatures: false,
                growthFeaturesEndsAt: null,
                growthFeaturesPriceIntervalId: null
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'pending_123', amountInCents: 5000 }));
            cancelPendingChangesSpy.mockResolvedValue(Ok(undefined));
            mockPaymentIntentsCreate.mockRejectedValue(new Error('Stripe API error'));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            // Left for Orb's `expiration_time` and the next attempt's cleanup rather than compensated here
            expect(cancelPendingChangesSpy).not.toHaveBeenCalled();
            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
        });

        it('should handle upgrade billing service errors', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'free',
                hasGrowthFeatures: false,
                growthFeaturesEndsAt: null,
                growthFeaturesPriceIntervalId: null
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            upgradeSpy.mockResolvedValue(Err(new Error('Billing service error')));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
        });
    });

    describe('Growth features add-on', () => {
        it('should enable add-on while staying on the same plan', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                name: 'pay-as-you-go',
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            getSubscriptionSpy.mockResolvedValue(
                Ok({
                    id: 'sub_123',
                    planExternalId: 'pay-as-you-go',
                    hasGrowthFeatures: false,
                    growthFeaturesEndsAt: null,
                    growthFeaturesPriceIntervalId: null
                } satisfies BillingSubscription)
            );

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'pay-as-you-go', withGrowthFeatures: true }
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);

            expect(startGrowthAddonSpy).toHaveBeenCalledWith({ subscriptionId: 'sub_123' });
            expect(upgradeSpy).not.toHaveBeenCalled();
        });

        it('should disable add-on at the end of the term rather than immediately', async () => {
            const { account, plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                name: 'pay-as-you-go',
                has_growth_features: true,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            getSubscriptionSpy.mockResolvedValue(
                Ok({
                    id: 'sub_123',
                    planExternalId: 'pay-as-you-go',
                    hasGrowthFeatures: true,
                    growthFeaturesEndsAt: null,
                    growthFeaturesPriceIntervalId: 'pi_growth'
                } satisfies BillingSubscription)
            );

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'pay-as-you-go', withGrowthFeatures: false }
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);

            expect(endGrowthAddonSpy).toHaveBeenCalledWith({ subscriptionId: 'sub_123', priceIntervalId: 'pi_growth' });
            expect(downgradeSpy).not.toHaveBeenCalled();
            expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();

            const updated = (await getPlan(db.knex, { accountId: account.id })).unwrap();
            expect(updated.growth_features_ends_at).toEqual(new Date('2026-10-01T00:00:00Z'));
            expect(updated.has_growth_features).toBe(true);

            expect(productTrackingSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'account:billing:downgraded',
                    eventProperties: expect.objectContaining({
                        previousPlan: 'pay-as-you-go',
                        newPlan: 'pay-as-you-go',
                        previousGrowthFeatures: true,
                        newGrowthFeatures: false
                    })
                })
            );
        });

        it('should end the add-on and then schedule the plan change when both move', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                name: 'pay-as-you-go',
                has_growth_features: true,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            getSubscriptionSpy.mockResolvedValue(
                Ok({
                    id: 'sub_123',
                    planExternalId: 'pay-as-you-go',
                    hasGrowthFeatures: true,
                    growthFeaturesEndsAt: null,
                    growthFeaturesPriceIntervalId: 'pi_growth'
                } satisfies BillingSubscription)
            );

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'free', withGrowthFeatures: false }
            });

            isSuccess(res.json);
            expect(endGrowthAddonSpy).toHaveBeenCalledWith({ subscriptionId: 'sub_123', priceIntervalId: 'pi_growth' });
            expect(downgradeSpy).toHaveBeenCalledWith({ subscriptionId: 'sub_123', planExternalId: 'free' });
            expect(endGrowthAddonSpy.mock.invocationCallOrder[0]).toBeLessThan(downgradeSpy.mock.invocationCallOrder[0]);
        });

        it('should not schedule the plan change when ending the add-on fails', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                name: 'pay-as-you-go',
                has_growth_features: true,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            getSubscriptionSpy.mockResolvedValue(
                Ok({
                    id: 'sub_123',
                    planExternalId: 'pay-as-you-go',
                    hasGrowthFeatures: true,
                    growthFeaturesEndsAt: null,
                    growthFeaturesPriceIntervalId: 'pi_growth'
                } satisfies BillingSubscription)
            );

            endGrowthAddonSpy.mockResolvedValue(Err(new Error('failed_to_end_growth_addon')));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'free', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(downgradeSpy).not.toHaveBeenCalled();
        });

        it('should upgrade the plan and enable the add-on in a single change', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({ id: plan.id, orb_subscription_id: 'sub_123', stripe_customer_id: 'cus_123', stripe_payment_id: 'pm_123' });

            getSubscriptionSpy.mockResolvedValue(
                Ok({
                    id: 'sub_123',
                    planExternalId: 'free',
                    hasGrowthFeatures: false,
                    growthFeaturesEndsAt: null,
                    growthFeaturesPriceIntervalId: null
                } satisfies BillingSubscription)
            );

            upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'pending_123', amountInCents: null }));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'pay-as-you-go', withGrowthFeatures: true }
            });

            isSuccess(res.json);
            expect(upgradeSpy).toHaveBeenCalledTimes(1);
            expect(upgradeSpy).toHaveBeenCalledWith({ subscriptionId: 'sub_123', planExternalId: 'pay-as-you-go' });
            expect(startGrowthAddonSpy).toHaveBeenCalledWith({ subscriptionId: 'sub_123' });
            expect(upgradeSpy.mock.invocationCallOrder[0]).toBeLessThan(startGrowthAddonSpy.mock.invocationCallOrder[0]);
        });

        it('should downgrade the plan when the add-on removal is already scheduled', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await setupPlan({
                id: plan.id,
                name: 'pay-as-you-go',
                has_growth_features: true,
                growth_features_ends_at: new Date('2026-10-01T00:00:00Z'),
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            getSubscriptionSpy.mockResolvedValue(
                Ok({
                    id: 'sub_123',
                    planExternalId: 'pay-as-you-go',
                    hasGrowthFeatures: true,
                    growthFeaturesEndsAt: new Date('2026-10-01T00:00:00Z'),
                    growthFeaturesPriceIntervalId: 'pi_growth'
                } satisfies BillingSubscription)
            );

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                token: apiKey.secret,
                body: { orbId: 'free', withGrowthFeatures: false }
            });

            isSuccess(res.json);
            expect(downgradeSpy).toHaveBeenCalledWith({ subscriptionId: 'sub_123', planExternalId: 'free' });
            expect(endGrowthAddonSpy).not.toHaveBeenCalled();
        });

        it('should reject a request that changes neither the plan nor the add-on', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({ id: plan.id, name: 'pay-as-you-go', orb_subscription_id: 'sub_123' });
            getSubscriptionSpy.mockResolvedValue(
                Ok({
                    id: 'sub_123',
                    planExternalId: 'pay-as-you-go',
                    hasGrowthFeatures: false,
                    growthFeaturesEndsAt: null,
                    growthFeaturesPriceIntervalId: null
                } satisfies BillingSubscription)
            );

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'pay-as-you-go', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({ code: 'invalid_body', message: 'team is already on this plan' });
        });

        it('should reject add-on on a plan that cannot carry it', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({ id: plan.id, orb_subscription_id: 'sub_123', stripe_customer_id: 'cus_123', stripe_payment_id: 'pm_123' });

            getSubscriptionSpy.mockResolvedValue(
                Ok({
                    id: 'sub_123',
                    planExternalId: 'free',
                    hasGrowthFeatures: false,
                    growthFeaturesEndsAt: null,
                    growthFeaturesPriceIntervalId: null
                } satisfies BillingSubscription)
            );

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: true }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({ code: 'invalid_body', message: 'growth features are not available on this plan' });
        });
    });

    describe('Downgrade Flow', () => {
        it('should allow downgrade to free without Stripe', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                name: 'starter-v2',
                orb_subscription_id: 'sub_123',
                stripe_customer_id: null,
                stripe_payment_id: null
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'starter-v2',
                hasGrowthFeatures: false,
                growthFeaturesEndsAt: null,
                growthFeaturesPriceIntervalId: null
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            downgradeSpy.mockResolvedValue(Ok(undefined));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'free', withGrowthFeatures: false }
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual({ success: true });
        });

        it('should reject a downgrade from growth-v2 to starter-v2', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                name: 'growth-v2',
                orb_subscription_id: 'sub_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'growth-v2',
                hasGrowthFeatures: false,
                growthFeaturesEndsAt: null,
                growthFeaturesPriceIntervalId: null
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({
                code: 'invalid_body',
                message: 'team cannot change to this plan'
            });
        });

        it('should reject if already scheduled for downgrade', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                name: 'starter-v2',
                orb_subscription_id: 'sub_123',
                orb_future_plan: 'free'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'starter-v2',
                hasGrowthFeatures: false,
                growthFeaturesEndsAt: null,
                growthFeaturesPriceIntervalId: null
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'free', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error).toStrictEqual({
                code: 'invalid_body',
                message: 'this change is already scheduled'
            });
        });

        it('should successfully downgrade', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                name: 'starter-v2',
                orb_subscription_id: 'sub_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'starter-v2',
                hasGrowthFeatures: false,
                growthFeaturesEndsAt: null,
                growthFeaturesPriceIntervalId: null
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            downgradeSpy.mockResolvedValue(Ok(undefined));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'free', withGrowthFeatures: false }
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual({ success: true });
        });

        it('should handle downgrade billing service errors', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                name: 'starter-v2',
                orb_subscription_id: 'sub_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'starter-v2',
                hasGrowthFeatures: false,
                growthFeaturesEndsAt: null,
                growthFeaturesPriceIntervalId: null
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            downgradeSpy.mockResolvedValue(Err(new Error('Billing service error')));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'free', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
        });
    });

    describe('Error Handling', () => {
        it('should handle billing service errors gracefully', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                orb_subscription_id: 'sub_123'
            });

            getSubscriptionSpy.mockResolvedValue(Err(new Error('Billing service error')));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
        });

        it('should handle Stripe API errors', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({
                id: plan.id,
                orb_subscription_id: 'sub_123',
                stripe_customer_id: 'cus_123',
                stripe_payment_id: 'pm_123'
            });

            const mockSubscription: BillingSubscription = {
                id: 'sub_123',
                planExternalId: 'free',
                hasGrowthFeatures: false,
                growthFeaturesEndsAt: null,
                growthFeaturesPriceIntervalId: null
            };

            getSubscriptionSpy.mockResolvedValue(Ok(mockSubscription));
            upgradeSpy.mockResolvedValue(Ok({ pendingChangeId: 'pending_123', amountInCents: 5000 }));
            cancelPendingChangesSpy.mockResolvedValue(Ok(undefined));
            mockPaymentIntentsCreate.mockRejectedValue(new Error('Stripe API error'));

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'starter-v2', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
            // Left for Orb's `expiration_time` and the next attempt's cleanup rather than compensated here
            expect(cancelPendingChangesSpy).not.toHaveBeenCalled();
        });

        it('should return a conflict when Orb and the database disagree', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await setupPlan({ id: plan.id, name: 'free', orb_subscription_id: 'sub_123', stripe_customer_id: 'cus_123', stripe_payment_id: 'pm_123' });

            // Orb has already moved the account onto pay-as-you-go; our row still says free
            getSubscriptionSpy.mockResolvedValue(
                Ok({
                    id: 'sub_123',
                    planExternalId: 'pay-as-you-go',
                    hasGrowthFeatures: false,
                    growthFeaturesEndsAt: null,
                    growthFeaturesPriceIntervalId: null
                } satisfies BillingSubscription)
            );

            const res = await api.fetch(route, {
                method: 'POST',
                query: { env: 'dev' },
                session,
                body: { orbId: 'pay-as-you-go', withGrowthFeatures: false }
            });

            isError(res.json);
            expect(res.res.status).toBe(409);
            expect(res.json.error.code).toBe('conflict');

            // Nothing was sent to Orb on a baseline we could not trust
            expect(upgradeSpy).not.toHaveBeenCalled();
            expect(downgradeSpy).not.toHaveBeenCalled();
            expect(cancelPendingChangesSpy).not.toHaveBeenCalled();
        });
    });
});
