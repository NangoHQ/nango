import Metronome from '@metronome/sdk';
import { envs } from '../envs.js';
import type { IngestEvent } from '../types.js';

const metronomeSDK = new Metronome({
    bearerToken: envs.METRONOME_BEARER_TOKEN,
    maxRetries: 3
});

export const metronome = {
    ingest: async (events: IngestEvent[]): Promise<void> => {
        await metronomeSDK.v1.usage.ingest(events.map(toMetronomeEvent));
    }
};

function toMetronomeEvent(event: IngestEvent): Metronome.V1.Usage.UsageIngestParams.Usage {
    return {
        event_type: event.type,
        transaction_id: event.transactionId,
        customer_id: event.accountId.toString(),
        timestamp: event.timestamp.toISOString(),
        properties: event.properties
    };
}
