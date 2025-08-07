import { Subscriber } from '@nangohq/pubsub';

import { logger } from '../utils.js';

import type { Transport } from '@nangohq/pubsub';

export class Billing {
    private subscriber: Subscriber;

    constructor(transport: Transport) {
        this.subscriber = new Subscriber(transport);
    }

    public start(): void {
        logger.info('Starting billing subscriber...');

        this.subscriber.subscribe({
            consumerGroup: 'billing',
            subscriptions: [
                {
                    subject: 'usage',
                    callback: (event) => {
                        // TODO
                        logger.info(`Received billing event: ${event.subject}`, event);
                    }
                }
            ]
        });
    }
}
