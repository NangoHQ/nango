import { uuidv7 } from 'uuidv7';

import { Err, Ok, flagHasUsage, report } from '@nangohq/utils';

import type { BillingClient, BillingCustomer, BillingIngestEvent, BillingMetric, BillingSubscription, BillingUsageMetric } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import { Batcher } from './batcher.js';
import { logger } from './logger.js';
import { envs } from './envs.js';

export class Billing {
    private batcher: Batcher<BillingIngestEvent> | null;
    constructor(private client: BillingClient) {
        this.client = client;
        this.batcher = flagHasUsage
            ? new Batcher(
                  async (events) => {
                      logger.info(`Sending ${events.length} billing events`);
                      const res = await this.ingest(events);
                      if (res.isErr()) {
                          logger.error(`failed to send billing events: ${res.error}`);
                          throw res.error;
                      }
                  },
                  {
                      maxBatchSize: envs.BILLING_INGEST_BATCH_SIZE,
                      flushIntervalMs: envs.BILLING_INGEST_BATCH_INTERVAL_MS,
                      maxQueueSize: envs.BILLING_INGEST_MAX_QUEUE_SIZE,
                      maxProcessingRetry: envs.BILLING_INGEST_MAX_RETRY
                  }
              )
            : null;
    }

    async shutdown(): Promise<Result<void>> {
        if (!this.batcher) {
            return Ok(undefined);
        }
        const res = await this.batcher.shutdown();
        if (res.isErr()) {
            logger.error(`Shutdown failure: ${res.error}`);
        }
        logger.info(`Successful shutdown`);
        return res;
    }

    add(type: BillingMetric['type'], value: number, props: BillingMetric['properties']): Result<void> {
        return this.addAll([{ type, value, properties: props }]);
    }

    addAll(events: BillingMetric[]): Result<void> {
        if (!this.batcher) {
            return Ok(undefined);
        }

        const mapped = events.flatMap((event) => {
            if (event.value === 0) {
                return [];
            }

            const { accountId, idempotencyKey, timestamp, ...rest } = event.properties;
            return [
                {
                    type: event.type,
                    accountId,
                    idempotencyKey: idempotencyKey || uuidv7(),
                    timestamp: timestamp || new Date(),
                    properties: {
                        count: event.value,
                        ...rest
                    }
                }
            ];
        });
        if (mapped.length > 0) {
            const result = this.batcher.add(...mapped);
            if (result.isErr()) {
                return Err(result.error);
            }
        }
        return Ok(undefined);
    }

    async getCustomer(accountId: number): Promise<Result<BillingCustomer>> {
        return await this.client.getCustomer(accountId);
    }

    async getSubscription(accountId: number): Promise<Result<BillingSubscription | null>> {
        return await this.client.getSubscription(accountId);
    }

    async getUsage(subscriptionId: string, period?: 'previous'): Promise<Result<BillingUsageMetric[]>> {
        return await this.client.getUsage(subscriptionId, period);
    }

    // Note: Events are sent immediately
    private async ingest(events: BillingIngestEvent[]): Promise<Result<void>> {
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
