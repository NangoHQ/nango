import db from '@nangohq/database';
import { Subscriber } from '@nangohq/pubsub';
import { accountService, connectionService, environmentService, productTracking } from '@nangohq/shared';
import { Err, Ok, report, stringifyError } from '@nangohq/utils';

import { logger } from '../utils.js';

import type { Transport, UsageEvent } from '@nangohq/pubsub';
import type { Result } from '@nangohq/utils';

export class CustomerTracking {
    private subscriber: Subscriber;

    constructor(transport: Transport) {
        this.subscriber = new Subscriber(transport);
    }

    public start(): void {
        logger.info('Starting customer tracking subscriber...');

        this.subscriber.subscribe({
            consumerGroup: 'customer-tracking',
            subject: 'usage',
            callback: async (event) => {
                logger.info(`Processing customer tracking event`, { event });
                const result = await process(event);
                if (result.isErr()) {
                    report(new Error(`Failed to process customer tracking event: ${result.error}`), { event });
                }
            }
        });
    }
}

async function process(event: UsageEvent): Promise<Result<void>> {
    try {
        switch (event.type) {
            case 'usage.connections': {
                logger.info(`Tracking usage for account ${event.payload.properties.accountId}`);
                if (typeof event.payload.properties['environmentId'] === 'number') {
                    await notifyOnProdUsageThreshold({
                        accountId: event.payload.properties.accountId,
                        environmentId: event.payload.properties['environmentId']
                    });
                }
                // No action for tracking connections
                return Ok(undefined);
            }
            default:
                return Ok(undefined);
        }
    } catch (err) {
        return Err(`Error processing customer tracking event: ${stringifyError(err)}`);
    }
}

async function notifyOnProdUsageThreshold({ accountId, environmentId }: { accountId: number; environmentId: number }): Promise<void> {
    const threshold = 3;
    try {
        const environment = await environmentService.getRawById(environmentId);

        if (environment && environment.name === 'prod') {
            const connections = await connectionService.countConnectionsByEnvironment({ environmentId });

            logger.info(`Account ${accountId} has ${connections} connections in production environment`);

            if (connections === threshold) {
                const team = await accountService.getAccountById(db.knex, accountId);
                if (team) {
                    logger.info(`Account ${accountId} has reached the threshold of ${threshold} connections in production environment`);
                    productTracking.track({
                        name: 'prod:connections:threshold_hit',
                        team,
                        userProperties: { connectionCount: threshold }
                    });
                }
            }
        }
    } catch (err) {
        report(new Error('Failed to notify on usage threshold', { cause: err }), { accountId });
    }
}
