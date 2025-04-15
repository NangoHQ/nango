import type { Result } from '@nangohq/utils';
import { Err, flagHasUsage, Ok, report } from '@nangohq/utils';
import type { BillingClient, BillingMetric, IngestEvent } from './types.js';
import { uuidv7 } from 'uuidv7';

export class Billing {
    constructor(private client: BillingClient) {
        this.client = client;
    }

    async send(type: BillingMetric['type'], value: number, props: BillingMetric['properties']): Promise<Result<void>> {
        return this.sendAll([{ type, value, properties: props }]);
    }

    async sendAll(events: BillingMetric[]): Promise<Result<void>> {
        const mapped = events.flatMap((event) => {
            if (event.value === 0) {
                return [];
            }
            return [
                {
                    type: event.type,
                    accountId: event.properties.accountId,
                    transactionId: event.properties.transactionId || uuidv7(),
                    timestamp: event.properties.timestamp || new Date(),
                    properties: {
                        count: event.value
                    }
                }
            ];
        });
        return this.ingest(mapped);
    }

    // Note: Events are sent immediately, not batching for now
    private async ingest(events: IngestEvent[]): Promise<Result<void>> {
        if (!flagHasUsage) {
            return Ok(undefined);
        }
        try {
            await this.client.ingest(events);
            return Ok(undefined);
        } catch (err: unknown) {
            const e = new Error(`Failed to send billing event`, { cause: err });
            report(e);
            return Err(e);
        }
    }
}
