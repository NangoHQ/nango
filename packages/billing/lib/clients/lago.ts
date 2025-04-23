import { Client as LagoClient } from 'lago-javascript-client';

import { envs } from '../envs.js';

import type { BillingClient, BillingIngestEvent } from '../types.js';
import type { EventInput } from 'lago-javascript-client';

const lagoClient = LagoClient(envs.LAGO_API_KEY || '');

export const lago: BillingClient = {
    ingest: async (events: BillingIngestEvent[]): Promise<void> => {
        const batchSize = 100;
        for (let i = 0; i < events.length; i += batchSize) {
            // Any fail will bubble up on purpose
            // getLagoError is useless and modifying the error
            await lagoClient.events.createBatchEvents({
                events: events.slice(i, i + batchSize).map(toLagoEvent)
            });
        }
    }
};

function toLagoEvent(event: BillingIngestEvent): EventInput['event'] {
    return {
        code: event.type,
        transaction_id: event.idempotencyKey,
        external_subscription_id: event.accountId.toString(),
        timestamp: event.timestamp.getTime(),
        properties: event.properties
    };
}
