import { Ok } from '@nangohq/utils';

import type { PublishBatchProps, PublishBatchResult, Transport } from './transport.js';
import type { Event } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export class NoOpTransport implements Transport {
    // eslint-disable-next-line @typescript-eslint/require-await
    public async connect(): Promise<Result<void>> {
        return Ok(undefined);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async disconnect(): Promise<Result<void>> {
        return Ok(undefined);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async publish(): Promise<Result<void>> {
        return Ok(undefined);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async publishBatch<TSubject extends Event['subject']>({ events }: PublishBatchProps<TSubject>): Promise<Result<PublishBatchResult>> {
        return Ok({ successful: events.map((e) => e.idempotencyKey), failed: [] });
    }

    public subscribe(): void {}
}
