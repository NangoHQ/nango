import type { Event } from './event.js';
import type { SubscribeProps, Transport } from './transport/transport.js';

export class Subscriber {
    private transport: Transport;

    constructor(transport: Transport) {
        this.transport = transport;
    }

    subscribe<TSubject extends Event['subject']>(params: SubscribeProps<TSubject>): void {
        this.transport.subscribe(params);
    }
}
