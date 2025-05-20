import Orb from 'orb-billing';

import { Err, Ok } from '@nangohq/utils';

import { envs } from '../envs.js';

import type { BillingClient, BillingCustomer, BillingIngestEvent, BillingSubscription, BillingUsageMetric, Result } from '@nangohq/types';

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

    async getCustomer(accountId: number): Promise<Result<BillingCustomer>> {
        try {
            const customer = await this.orbSDK.customers.fetchByExternalId(String(accountId));
            return Ok({ id: customer.id, portalUrl: customer.portal_url });
        } catch (err) {
            return Err(new Error('failed_to_get_customer', { cause: err }));
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
