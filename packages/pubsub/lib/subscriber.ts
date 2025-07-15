import type { Subscription, Transport } from './transport/transport.js';

export class Subscriber {
    private transport: Transport;

    constructor(transport: Transport) {
        this.transport = transport;
    }

    public subscribe({ consumerGroup, subscriptions }: { consumerGroup: string; subscriptions: Subscription[] }): void {
        this.transport.subscribe({ consumerGroup, subscriptions });
    }
}
