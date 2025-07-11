import type { SetOptional } from 'type-fest';
import { v4 as uuidv4 } from 'uuid';
import type { Result } from '@nangohq/utils';
import type { Transport } from './transport/transport.js';
import type { Event } from './event.js';

export class Publisher {
    private transport: Transport;

    constructor(transport: Transport) {
        this.transport = transport;
    }

    public async publish(event: SetOptional<Event, 'idempotencyKey' | 'createdAt'>): Promise<Result<void>> {
        return this.transport.publish({
            ...event,
            idempotencyKey: event.idempotencyKey ?? uuidv4(),
            createdAt: event.createdAt ?? new Date()
        });
    }
}
