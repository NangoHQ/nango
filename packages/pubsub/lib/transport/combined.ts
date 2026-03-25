import { Err, Ok } from '@nangohq/utils';

import type { Event } from '../event.js';
import type { SubscribeProps, Transport } from './transport.js';
import type { Result } from '@nangohq/utils';

export class CombinedTransportError extends Error {
    readonly causes: readonly Error[];

    constructor(operation: CombinedOperation, causes: Error[]) {
        const summary = causes.map((e) => e.message).join('; ');
        super(`Combined transport ${operation} failed (${causes.length} transports): ${summary}`);
        this.name = 'CombinedTransportError';
        this.causes = causes;
    }
}

type CombinedOperation = 'connect' | 'disconnect' | 'publish';

function mergeResults(operation: CombinedOperation, results: Result<void>[]): Result<void> {
    const causes: Error[] = [];
    for (const res of results) {
        if (res.isErr()) {
            causes.push(res.error);
        }
    }
    if (causes.length === 0) {
        return Ok(undefined);
    }
    return Err(new CombinedTransportError(operation, causes));
}

export class Combined implements Transport {
    private transports: Transport[];

    constructor(transports: Transport[]) {
        this.transports = transports;
    }

    async connect(): Promise<Result<void>> {
        const results = await Promise.all(this.transports.map((t) => t.connect()));
        return mergeResults('connect', results);
    }

    async disconnect(): Promise<Result<void>> {
        const results = await Promise.all(this.transports.map((t) => t.disconnect()));
        return mergeResults('disconnect', results);
    }

    async publish(event: Event): Promise<Result<void>> {
        const results = await Promise.all(this.transports.map((t) => t.publish(event)));
        return mergeResults('publish', results);
    }

    subscribe<TSubject extends Event['subject']>(params: SubscribeProps<TSubject>): void {
        for (const transport of this.transports) {
            transport.subscribe(params);
        }
    }
}
