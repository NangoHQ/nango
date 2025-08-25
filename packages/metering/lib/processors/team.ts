import { billing, getStripe } from '@nangohq/billing';
import db from '@nangohq/database';
import { Subscriber } from '@nangohq/pubsub';
import { accountService, getPlan } from '@nangohq/shared';
import { Err, Ok, report, stringifyError } from '@nangohq/utils';

import { logger } from '../utils.js';

import type { TeamEvent, Transport } from '@nangohq/pubsub';
import type { Result } from '@nangohq/utils';

export class Team {
    private subscriber: Subscriber;

    constructor(transport: Transport) {
        this.subscriber = new Subscriber(transport);
    }

    public start(): void {
        logger.info('Starting team subscriber...');

        this.subscriber.subscribe({
            consumerGroup: 'team',
            subject: 'team',
            callback: async (event) => {
                logger.info(`Processing team event`, { event });
                const result = await process(event);
                if (result.isErr()) {
                    report(new Error(`Failed to process billing event: ${result.error}`), { event });
                    return;
                }
            }
        });
    }
}

async function process(event: TeamEvent): Promise<Result<void>> {
    try {
        switch (event.type) {
            case 'team.updated': {
                const id = event.payload.id;
                const team = await accountService.getAccountById(db.knex, id);
                if (!team) {
                    return Err(`Team ${id} not found`);
                }
                const resPlan = await getPlan(db.knex, { accountId: team.id });
                if (resPlan.isErr()) {
                    return Err(new Error(`Failed to get plan for team ${id}`, { cause: resPlan.error }));
                }

                const plan = resPlan.value;
                if (plan.stripe_customer_id) {
                    try {
                        const stripe = getStripe();
                        await stripe.customers.update(plan.stripe_customer_id, { name: team.name });
                    } catch (err) {
                        report(new Error('Failed to update customer name in stripe', { cause: err }), { accountId: team.id });
                    }
                }

                if (plan.orb_customer_id) {
                    try {
                        await billing.updateCustomer(plan.orb_customer_id, team.name);
                    } catch (err) {
                        report(new Error('Failed to update customer name in orb', { cause: err }), { accountId: team.id });
                    }
                }
                return Ok(undefined);
            }

            default:
                return Err(`Unknown team event type: ${event.type}`);
        }
    } catch (err) {
        return Err(`Error processing team event: ${stringifyError(err)}`);
    }
}
