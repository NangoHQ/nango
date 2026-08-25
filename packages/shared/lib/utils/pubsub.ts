import { DefaultTransport, Publisher } from '@nangohq/pubsub';

import type { Transport } from '@nangohq/pubsub';
import type { Result } from '@nangohq/utils';

class PubSub {
    public publisher: Publisher;
    public transport: Transport;

    constructor() {
        this.transport = new DefaultTransport();
        this.publisher = new Publisher(this.transport);
    }

    async connect(): Promise<Result<void>> {
        return this.transport.connect();
    }

    async disconnect(): Promise<Result<void>> {
        return this.transport.disconnect();
    }
}

export const pubsub = new PubSub();
