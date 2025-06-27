import Orb from 'orb-billing';

import { Err, Ok } from '@nangohq/utils';

import { envs } from '../envs.js';

import type { BillingClient, BillingCustomer, BillingIngestEvent, BillingSubscription, BillingUsageMetric, DBTeam, DBUser, Result } from '@nangohq/types';

export class OrbClient implements BillingClient {
    private orbSDK: Orb;

    constructor() {
        this.orbSDK = new Orb({
            apiKey: envs.ORB_API_KEY || 'empty',
            maxRetries: 3
        });
    }

    async ingest(events: BillingIngestEvent[]) {
        // Orb limit the number of events per batch to 500
        const batchSize = 500;

        for (let i = 0; i < events.length; i += batchSize) {
            const batch = events.slice(i, i + batchSize);
            await this.orbSDK.events.ingest({
                events: batch.map(toOrbEvent)
            });
        }
    }

    async upsertCustomer(team: DBTeam, user: DBUser): Promise<Result<BillingCustomer>> {
        try {
            let exists: Orb.Customers.Customer | null = null;
            try {
                exists = await this.orbSDK.customers.fetchByExternalId(String(team.id));
            } catch {
                // expected error
            }

            if (exists) {
                await this.orbSDK.customers.update(exists.id, {
                    name: team.name
                });
                return Ok({ id: exists.id, portalUrl: exists.portal_url });
            }

            const customer = await this.orbSDK.customers.create({
                external_customer_id: String(team.id),
                currency: 'USD',
                name: team.name,
                email: user.email
            });
            return Ok({ id: customer.id, portalUrl: customer.portal_url });
        } catch (err) {
            return Err(new Error('failed_to_upsert_customer', { cause: err }));
        }
    }

    async linkStripeToCustomer(teamId: number, customerId: string): Promise<Result<void>> {
        try {
            await this.orbSDK.customers.updateByExternalId(String(teamId), {
                payment_provider: 'stripe_invoice',
                payment_provider_id: customerId
            });
            return Ok(undefined);
        } catch (err) {
            return Err(new Error('failed_to_link_customer', { cause: err }));
        }
    }

    async getCustomer(accountId: number): Promise<Result<BillingCustomer>> {
        try {
            const customer = await this.orbSDK.customers.fetchByExternalId(String(accountId));
            return Ok({ id: customer.id, portalUrl: customer.portal_url });
        } catch (err) {
            return Err(new Error('failed_to_get_customer', { cause: err }));
        }
    }

    async createSubscription(team: DBTeam, planExternalId: string): Promise<Result<BillingSubscription>> {
        try {
            const subscription = await this.orbSDK.subscriptions.create({
                external_customer_id: String(team.id),
                external_plan_id: planExternalId,
                start_date: team.created_at.toISOString()
            });
            return Ok({ id: subscription.id });
        } catch (err) {
            return Err(new Error('failed_to_create_subscription', { cause: err }));
        }
    }

    async getSubscription(accountId: number): Promise<Result<BillingSubscription | null>> {
        try {
            const subs = await this.orbSDK.subscriptions.list({ external_customer_id: [String(accountId)], status: 'active' });
            return Ok(subs.data.length > 0 ? { id: subs.data[0]!.id } : null);
        } catch (err) {
            return Err(new Error('failed_to_get_customer', { cause: err }));
        }
    }

    async getUsage(subscriptionId: string, period?: 'previous'): Promise<Result<BillingUsageMetric[]>> {
        try {
            const options: Orb.Subscriptions.SubscriptionFetchUsageParams = {};
            if (period === 'previous') {
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                start.setHours(0, 0, 0, 0);
                const end = new Date(now.getFullYear(), now.getMonth(), 0);
                end.setHours(23, 59, 59, 999);
                options.timeframe_start = start.toISOString();
                options.timeframe_end = end.toISOString();
            }

            const res = await this.orbSDK.subscriptions.fetchUsage(subscriptionId, options, {
                // https://docs.withorb.com/api-reference/cached-responses
                headers: {
                    'Orb-Cache-Control': 'cache',
                    'Orb-Cache-Max-Age-Seconds': '60'
                }
            });
            return Ok(
                res.data.map((item) => {
                    return {
                        id: item.billable_metric.id,
                        name: item.billable_metric.name,
                        quantity: item.usage[0]?.quantity || 0
                    };
                })
            );
        } catch (err) {
            return Err(new Error('failed_to_get_customer', { cause: err }));
        }
    }

    async upgrade(opts: { subscriptionId: string; planExternalId: string; immediate: boolean }): Promise<Result<void>> {
        try {
            await this.orbSDK.subscriptions.schedulePlanChange(opts.subscriptionId, {
                change_option: opts.immediate ? 'immediate' : 'end_of_subscription_term',
                billing_cycle_alignment: 'plan_change_date',
                auto_collection: true,
                external_plan_id: opts.planExternalId
            });
            return Ok(undefined);
        } catch (err) {
            return Err(new Error('failed_to_upgrade_customer', { cause: err }));
        }
    }

    verifyWebhookSignature(body: string, headers: Record<string, unknown>, secret: string): Result<true> {
        try {
            this.orbSDK.webhooks.verifySignature(body, headers as any, secret);

            return Ok(true);
        } catch (err) {
            return Err(new Error('failed_to_verify_signature', { cause: err }));
        }
    }

    async getPlanById(planId: string): Promise<Result<{ id: string; external_plan_id: string }>> {
        try {
            const plan = await this.orbSDK.plans.fetch(planId);

            return Ok({ id: plan.id, external_plan_id: plan.external_plan_id! });
        } catch (err) {
            return Err(new Error('failed_to_get_plan_by_id', { cause: err }));
        }
    }
}

function toOrbEvent(event: BillingIngestEvent): Orb.Events.EventIngestParams.Event {
    return {
        event_name: event.type,
        idempotency_key: event.idempotencyKey,
        external_customer_id: event.accountId.toString(),
        timestamp: event.timestamp.toISOString(),
        properties: event.properties
    };
}
