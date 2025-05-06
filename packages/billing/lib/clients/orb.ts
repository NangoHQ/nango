import Orb from 'orb-billing';

import { envs } from '../envs.js';

import type { BillingClient, BillingIngestEvent } from '@nangohq/types';

const orbSDK = new Orb({
    apiKey: envs.ORB_API_KEY || 'empty',
    maxRetries: 3
});

export const orb: BillingClient = {
    ingest: async (events) => {
        // Orb limit the number of events per batch to 500
        const batchSize = 500;

        for (let i = 0; i < events.length; i += batchSize) {
            const batch = events.slice(i, i + batchSize);
            await orbSDK.events.ingest({
                events: batch.map(toOrbEvent)
            });
        }
    },

    getCustomer: async (accountId) => {
        const customer = await orbSDK.customers.fetchByExternalId(String(accountId));
        return { id: customer.id, portalUrl: customer.portal_url };
    },

    getSubscription: async (accountId) => {
        const subs = await orbSDK.subscriptions.list({ external_customer_id: [String(accountId)], status: 'active' });
        return subs.data.length > 0 ? { id: subs.data[0]!.id } : null;
    },

    getUsage: async (subscriptionId, period) => {
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

        const res = await orbSDK.subscriptions.fetchUsage(subscriptionId, options);
        return res.data.map((item) => {
            return {
                id: item.billable_metric.id,
                name: item.billable_metric.name,
                quantity: item.usage[0]?.quantity || 0
            };
        });
    }
};

function toOrbEvent(event: BillingIngestEvent): Orb.Events.EventIngestParams.Event {
    return {
        event_name: event.type,
        idempotency_key: event.idempotencyKey,
        external_customer_id: event.accountId.toString(),
        timestamp: event.timestamp.toISOString(),
        properties: event.properties
    };
}
