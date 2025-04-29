import Orb from 'orb-billing';

import { envs } from '../envs.js';

import type { BillingIngestEvent } from '../types.js';

const orbSDK = new Orb({
    apiKey: envs.ORB_API_KEY,
    maxRetries: 3
});

export const orb = {
    ingest: async (events: BillingIngestEvent[]): Promise<void> => {
        await orbSDK.events.ingest({
            events: events.map(toOrbEvent)
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
