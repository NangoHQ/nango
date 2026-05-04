import { Err, Ok, flagHasUsage } from '@nangohq/utils';

import { Batcher } from './batcher.js';
import { envs } from './envs.js';
import { BillingEventGrouping } from './grouping.js';
import { logger } from './logger.js';

import type {
    BillingClient,
    BillingCustomer,
    BillingEvent,
    BillingInvoicingDetails,
    BillingPlan,
    BillingSubscription,
    BillingUsageMetrics,
    DBTeam,
    GetBillingUsageOpts
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export class Billing {
    private batcher: Batcher<BillingEvent> | null;

    client: BillingClient;

    constructor(client: BillingClient) {
        this.client = client;
        this.batcher = flagHasUsage
            ? new Batcher({
                  process: async (events) => {
                      const res = await this.ingest(events);
                      if (res.isErr()) {
                          logger.error(res.error.message);
                          throw res.error;
                      }
                  },
                  maxBatchSize: envs.BILLING_INGEST_BATCH_SIZE,
                  flushIntervalMs: envs.BILLING_INGEST_BATCH_INTERVAL_MS,
                  maxQueueSize: envs.BILLING_INGEST_MAX_QUEUE_SIZE,
                  maxProcessingRetry: envs.BILLING_INGEST_MAX_RETRY,
                  grouping: new BillingEventGrouping()
              })
            : null;
    }

    async shutdown(): Promise<Result<void>> {
        if (this.batcher) {
            return this.batcher.shutdown();
        }
        return Ok(undefined);
    }

    add(events: BillingEvent[]): Result<void> {
        if (!this.batcher) {
            return Ok(undefined);
        }
        const filtered = events.filter((e) => e.properties.count > 0);
        if (filtered.length > 0) {
            const result = this.batcher.add(...filtered);
            if (result.isErr()) {
                return Err(result.error);
            }
        }
        return Ok(undefined);
    }

    async getCustomer(accountId: number): Promise<Result<BillingCustomer>> {
        return await this.client.getCustomer(accountId);
    }

    async getOrCreateCustomer(accountId: number, defaultTo: Pick<BillingInvoicingDetails, 'legalEntityName' | 'email'>): Promise<Result<BillingCustomer>> {
        return await this.client.getOrCreateCustomer(accountId, defaultTo);
    }

    async putCustomer(accountId: number, invoicingDetails: BillingInvoicingDetails): Promise<Result<BillingCustomer>> {
        return await this.client.putCustomer(accountId, invoicingDetails);
    }

    async linkStripeToCustomer(teamId: number, customerId: string): Promise<Result<void>> {
        return await this.client.linkStripeToCustomer(teamId, customerId);
    }

    async createSubscription(team: DBTeam, planExternalId: string): Promise<Result<BillingSubscription>> {
        return await this.client.createSubscription(team, planExternalId);
    }

    async getSubscription(accountId: number): Promise<Result<BillingSubscription | null>> {
        return await this.client.getSubscription(accountId);
    }

    async getUsage(subscriptionId: string, opts?: GetBillingUsageOpts): Promise<Result<BillingUsageMetrics>> {
        return await this.client.getUsage(subscriptionId, opts);
    }

    async upgrade(opts: { subscriptionId: string; planExternalId: string }): Promise<Result<{ pendingChangeId: string; amountInCents: number | null }>> {
        return await this.client.upgrade(opts);
    }

    async downgrade(opts: { subscriptionId: string; planExternalId: string }): Promise<Result<void>> {
        return await this.client.downgrade(opts);
    }

    async getPlanById(planId: string): Promise<Result<BillingPlan>> {
        return await this.client.getPlanById(planId);
    }

    verifyWebhookSignature(body: string, headers: Record<string, unknown>, secret: string): Result<true> {
        return this.client.verifyWebhookSignature(body, headers, secret);
    }

    // Note: Events are sent immediately
    private async ingest(events: BillingEvent[]): Promise<Result<void>> {
        return this.client.ingest(events);
    }
}
