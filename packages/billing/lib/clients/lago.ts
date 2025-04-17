import type { EventInput } from 'lago-javascript-client';
import { Client as LagoClient, getLagoError } from 'lago-javascript-client';
import { envs } from '../envs.js';
import type { BillingClient, IngestEvent } from '../types.js';

const lagoClient = LagoClient(envs.LAGO_API_KEY || '');

export const lago: BillingClient = {
    ingest: async (events: IngestEvent[]): Promise<void> => {
        const batchSize = 100;
        for (let i = 0; i < events.length; i += batchSize) {
            try {
                await lagoClient.events.createBatchEvents({
                    events: events.slice(i, i + batchSize).map(toLagoEvent)
                });
            } catch (err) {
                throw await getLagoError<typeof lagoClient.events.createBatchEvents>(err);
            }
        }
    }
};

function toLagoEvent(event: IngestEvent): EventInput['event'] {
    return {
        code: event.type,
        transaction_id: event.idempotencyKey,
        external_subscription_id: event.accountId.toString(),
        timestamp: event.timestamp.getTime(),
        properties: event.properties
    };
}
