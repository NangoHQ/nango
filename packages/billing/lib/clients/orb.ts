import Orb from 'orb-billing';

import { envs } from '../envs.js';

import type { BillingClient, BillingIngestEvent } from '../types.js';

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
