import { Err, Ok } from '@nangohq/utils';

import type { SubscribeProps, Transport } from './transport.js';
import type { Event } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export class MigrationTransportError extends Error {
    readonly causes: readonly Error[];

    constructor(operation: MigrationOperation, causes: Error[]) {
        const summary = causes.map((e) => e.message).join('; ');
        super(`Migration transport ${operation} failed (${causes.length} transports): ${summary}`);
        this.name = 'MigrationTransportError';
        this.causes = causes;
    }
}

type MigrationOperation = 'connect' | 'disconnect' | 'publish';

function mergeResults(operation: MigrationOperation, results: Result<void>[]): Result<void> {
    const causes: Error[] = [];
    for (const res of results) {
        if (res.isErr()) {
            causes.push(res.error);
        }
    }
    if (causes.length === 0) {
        return Ok(undefined);
    }
    return Err(new MigrationTransportError(operation, causes));
}

export class Migration implements Transport {
    private publisher: Transport;
    private subscribers: Transport[];

    constructor(publisher: Transport, subscribers: Transport[]) {
        this.publisher = publisher;
        this.subscribers = subscribers;
    }

    async connect(): Promise<Result<void>> {
        const results = await Promise.all([this.publisher.connect(), ...this.subscribers.map((t) => t.connect())]);
        return mergeResults('connect', results);
    }

    async disconnect(): Promise<Result<void>> {
        const results = await Promise.all([this.publisher.disconnect(), ...this.subscribers.map((t) => t.disconnect())]);
        return mergeResults('disconnect', results);
    }

    async publish(event: Event): Promise<Result<void>> {
        const results = await this.publisher.publish(event);
        return results;
    }

    subscribe<TSubject extends Event['subject']>(params: SubscribeProps<TSubject>): void {
        for (const transport of this.subscribers) {
            transport.subscribe(params);
        }
    }
}
