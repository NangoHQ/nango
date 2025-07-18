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
            // We want to backdate the subscription to the day the team was created to backfill the usage
            // Orb doesn't allow to backdate the subscription by more than 95 days
            // Use `upgrade` to change the subscription without backdating
            const minStartDate = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000);
            const startDate = new Date(Math.max(team.created_at.getTime(), minStartDate.getTime())).toISOString();

            const subscription = await this.orbSDK.subscriptions.create({
                external_customer_id: String(team.id),
                external_plan_id: planExternalId,
                start_date: startDate
            });
            return Ok({ id: subscription.id, planExternalId: planExternalId });
        } catch (err) {
            return Err(new Error('failed_to_create_subscription', { cause: err }));
        }
    }

    async getSubscription(accountId: number): Promise<Result<BillingSubscription | null>> {
        try {
            const subs = await this.orbSDK.subscriptions.list({ external_customer_id: [String(accountId)], status: 'active' });
            if (subs.data.length === 0) {
                return Ok(null);
            }

            const sub = subs.data[0]!;
            return Ok({
                id: sub.id,
                pendingChangeId: sub.pending_subscription_change?.id,
                planExternalId: sub.plan?.external_plan_id || ''
            });
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

    async upgrade(opts: { subscriptionId: string; planExternalId: string }): Promise<Result<{ pendingChangeId: string; amountInCents: number | null }>> {
        try {
            // We schedule the upgrade but we don't apply it yet
            // We apply it when the first payment is made to confirm the card
            const pendingUpgrade = await this.orbSDK.subscriptions.schedulePlanChange(
                opts.subscriptionId,
                {
                    change_option: 'immediate', // It will be immediate after first payment
                    auto_collection: true,
                    external_plan_id: opts.planExternalId
                },
                { headers: { 'Create-Pending-Subscription-Change': 'true' } }
            );

            // Invoices created are ordered by due date
            // The first one is the pending one (if there was one) and the second is what we will charge
            // Since the order and numbers are unreliable, we need to find the one that is due today
            let amountDue = 0;
            for (const invoice of pendingUpgrade.changed_resources?.created_invoices || []) {
                if (!invoice.due_date) {
                    continue;
                }
                if (new Date(invoice.due_date).getTime() > Date.now()) {
                    continue;
                }
                if (invoice.amount_due === '0.00') {
                    continue;
                }
                amountDue = Number(invoice.amount_due) * 100;
                break;
            }

            return Ok({
                pendingChangeId: pendingUpgrade.pending_subscription_change!.id,
                // We return the amount due for the first invoice, it's the pending one that contains the pro-rated amount if any
                amountInCents: amountDue || null
            });
        } catch (err) {
            return Err(new Error('failed_to_upgrade_customer', { cause: err }));
        }
    }

    async downgrade(opts: { subscriptionId: string; planExternalId: string }): Promise<Result<void>> {
        try {
            await this.orbSDK.subscriptions.schedulePlanChange(opts.subscriptionId, {
                change_option: 'end_of_subscription_term',
                auto_collection: true,
                external_plan_id: opts.planExternalId
            });

            return Ok(undefined);
        } catch (err) {
            return Err(new Error('failed_to_upgrade_customer', { cause: err }));
        }
    }

    async applyPendingChanges(opts: { pendingChangeId: string; amount: string }): Promise<Result<void>> {
        try {
            // We apply the pending change to confirm the card
            await this.orbSDK.subscriptionChanges.apply(opts.pendingChangeId, {
                description: 'Initial payment on subscription',
                previously_collected_amount: opts.amount
            });

            return Ok(undefined);
        } catch (err) {
            return Err(new Error('failed_to_apply_pending_changes', { cause: err }));
        }
    }

    async cancelPendingChanges(opts: { pendingChangeId: string }): Promise<Result<void>> {
        try {
            await this.orbSDK.subscriptionChanges.cancel(opts.pendingChangeId);

            return Ok(undefined);
        } catch (err) {
            return Err(new Error('failed_to_cancel_pending_changes', { cause: err }));
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
