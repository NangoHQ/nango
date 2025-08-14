import { billing } from '@nangohq/billing';
import { Subscriber } from '@nangohq/pubsub';
import { connectionService } from '@nangohq/shared';
import { Err, Ok, metrics, stringifyError } from '@nangohq/utils';

import { logger } from '../utils.js';

import type { Transport, UsageEvent } from '@nangohq/pubsub';
import type { Result } from '@nangohq/utils';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export class Billing {
    private subscriber: Subscriber;

    constructor(transport: Transport) {
        this.subscriber = new Subscriber(transport);
    }

    public start(): void {
        logger.info('Starting billing subscriber...');

        this.subscriber.subscribe({
            consumerGroup: 'billing',
            subject: 'usage',
            callback: async (event) => {
                logger.info(`Processing billing event`, { event });
                const result = await process(event);
                if (result.isErr()) {
                    logger.error(`Failed to process billing event: ${result.error}`, { event });
                    return;
                }
            }
        });
    }
}

async function process(event: UsageEvent): Promise<Result<void>> {
    try {
        switch (event.type) {
            case 'usage.monthly_active_records': {
                const { connectionId } = event.payload.properties;
                const connection = await connectionService.getConnectionById(connectionId);
                if (!connection) {
                    return Err(`Connection ${connectionId} not found`);
                }
                if (connection.created_at > new Date(Date.now() - 30 * DAY_IN_MS)) {
                    return Ok(undefined); // Skip MAR for connections younger than 30 days
                }
                const mar = event.payload.value;
                metrics.increment(metrics.Types.BILLED_RECORDS_COUNT, mar, { accountId: event.payload.properties.accountId });
                return billing.add('monthly_active_records', mar, {
                    idempotencyKey: event.idempotencyKey,
                    timestamp: event.createdAt,
                    ...event.payload.properties
                });
            }
            case 'usage.actions': {
                return billing.add('billable_actions', event.payload.value, {
                    idempotencyKey: event.idempotencyKey,
                    timestamp: event.createdAt,
                    ...event.payload.properties
                });
            }
            default:
                return Err(`Unknown billing event type: ${event.type}`);
        }
    } catch (err) {
        return Err(`Error processing billing event: ${stringifyError(err)}`);
    }
}
