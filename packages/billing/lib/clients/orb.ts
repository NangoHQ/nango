import Orb from 'orb-billing';

import { envs } from '../envs.js';

import type { BillingClient, BillingIngestEvent } from '@nangohq/types';

const orbSDK = new Orb({
    apiKey: envs.ORB_API_KEY || 'empty',
    maxRetries: 3
});

export const orb: BillingClient = {
    ingest: async (events) => {
        const batchSize = 500;
        for (let i = 0; i < events.length; i += batchSize) {
            const batch = events.slice(i, i + batchSize);
            await orbSDK.events.ingest({
                events: batch.map(toOrbEvent)
            });
        }
    },

    getUsage: async (subscriptionId) => {
        const res = await orbSDK.subscriptions.fetchUsage(subscriptionId, {});
        return res.data.map((item) => {
            return {
                id: item.billable_metric.id,
                name: item.billable_metric.name,
                quantity: item.usage[0]?.quantity || 0
            };
        });
    },

    getUsagePrevious: async (subscriptionId) => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        end.setHours(23, 59, 59, 999);

        const res = await orbSDK.subscriptions.fetchUsage(subscriptionId, {
            timeframe_start: start.toISOString(),
            timeframe_end: end.toISOString()
        });
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
