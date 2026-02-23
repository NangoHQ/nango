import { envs } from '../env.js';
import { SqsEventListener } from '../events/sqs.listener.js';

import type { EventListener, QueueMessage } from '../events/listener.js';

export class InvocationsProcessor {
    private eventListener: EventListener;

    constructor() {
        this.eventListener = new SqsEventListener();
    }

    async start() {
        if (envs.LAMBDA_FAILURE_DESTINATION) {
            await this.eventListener.listen(envs.LAMBDA_FAILURE_DESTINATION, (message) => this.processMessage(message));
        }
    }

    private async processMessage(message: QueueMessage) {
        //just log the message for now
        return Promise.resolve(console.log(JSON.stringify(message, null, 2)));
    }
}
