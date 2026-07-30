import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, metrics, Ok } from '@nangohq/utils';

import { Publisher } from './publisher.js';
import { PublishFailure } from './transport/transport.js';

import type { Transport } from './transport/transport.js';
import type { Event } from '@nangohq/types';

const event = { subject: 'team', type: 'team.updated', payload: { id: 1 } } as unknown as Event;

function transportWith(overrides: Partial<Transport>): Transport {
    return overrides as unknown as Transport;
}

describe('Publisher.publish', () => {
    afterEach(() => vi.restoreAllMocks());

    it('counts a success', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const publisher = new Publisher(transportWith({ publish: () => Promise.resolve(Ok(undefined)) }));

        expect((await publisher.publish(event)).isOk()).toBe(true);
        expect(inc).toHaveBeenCalledWith(metrics.Types.PUBSUB_PUBLISH, 1, { subject: 'team', success: 'true' });
    });

    it('counts a failure', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const publisher = new Publisher(transportWith({ publish: () => Promise.resolve(Err(new Error('down'))) }));

        expect((await publisher.publish(event)).isErr()).toBe(true);
        expect(inc).toHaveBeenCalledWith(metrics.Types.PUBSUB_PUBLISH, 1, { subject: 'team', success: 'false' });
    });

    it('stamps an idempotencyKey and createdAt when the caller omits them', async () => {
        vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const publish = vi.fn().mockResolvedValue(Ok(undefined));
        await new Publisher(transportWith({ publish })).publish(event);

        const published = publish.mock.calls[0]![0] as Event;
        expect(published.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
        expect(published.createdAt).toBeInstanceOf(Date);
    });
});

describe('Publisher.publishBatch', () => {
    afterEach(() => vi.restoreAllMocks());

    it('counts successes and failures separately on a partial failure', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const publisher = new Publisher(
            transportWith({
                publishBatch: () =>
                    Promise.resolve(
                        Ok({
                            successful: ['a', 'b'],
                            failed: [new PublishFailure('c', 'nope')]
                        })
                    )
            })
        );

        await publisher.publishBatch({ subject: 'team', events: [event, event, event] as never });

        expect(inc).toHaveBeenCalledWith(metrics.Types.PUBSUB_PUBLISH, 2, { subject: 'team', success: 'true' });
        expect(inc).toHaveBeenCalledWith(metrics.Types.PUBSUB_PUBLISH, 1, { subject: 'team', success: 'false' });
    });

    it('counts the whole batch as failed on a total failure', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const publisher = new Publisher(transportWith({ publishBatch: () => Promise.resolve(Err(new Error('down'))) }));

        await publisher.publishBatch({ subject: 'team', events: [event, event] as never });

        expect(inc).toHaveBeenCalledWith(metrics.Types.PUBSUB_PUBLISH, 2, { subject: 'team', success: 'false' });
    });
});
