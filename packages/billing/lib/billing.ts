import { uuidv7 } from 'uuidv7';

import { Err, Ok, flagHasUsage, report } from '@nangohq/utils';

import type { BillingClient, BillingCustomer, BillingIngestEvent, BillingMetric, BillingSubscription, BillingUsageMetric } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

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
                    idempotencyKey: event.properties.idempotencyKey || uuidv7(),
                    timestamp: event.properties.timestamp || new Date(),
                    properties: {
                        count: event.value
                    }
                }
            ];
        });

        return await this.ingest(mapped);
    }

    async getCustomer(accountId: number): Promise<BillingCustomer> {
        return await this.client.getCustomer(accountId);
    }

    async getSubscription(accountId: number): Promise<BillingSubscription | null> {
        return await this.client.getSubscription(accountId);
    }

    async getUsage(subscriptionId: string, period?: 'previous'): Promise<BillingUsageMetric[]> {
        return await this.client.getUsage(subscriptionId, period);
    }

    // Note: Events are sent immediately
    private async ingest(events: BillingIngestEvent[]): Promise<Result<void>> {
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
