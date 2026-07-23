import { describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { OrchestratorProcessor } from './processor.js';

import type { OrchestratorClient } from './client.js';
import type { OrchestratorTask } from './types.js';
import type { Result } from '@nangohq/utils';

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

describe('OrchestratorProcessor', () => {
    it('only dequeues as many tasks as there are free worker slots', async () => {
        const firstHandler = deferred<undefined>();
        const secondHandler = deferred<undefined>();
        const secondDequeue = deferred<Result<OrchestratorTask[]>>();
        const tasks = [{ id: 'task-1' }, { id: 'task-2' }] as OrchestratorTask[];
        const dequeue = vi
            .fn()
            .mockResolvedValueOnce(Ok(tasks))
            .mockImplementationOnce(() => secondDequeue.promise);
        const handler = vi
            .fn()
            .mockImplementationOnce(() => firstHandler.promise.then(() => Ok(undefined)))
            .mockImplementationOnce(() => secondHandler.promise.then(() => Ok(undefined)));
        const processor = new OrchestratorProcessor({
            orchestratorClient: { dequeue } as unknown as OrchestratorClient,
            groupKeyPattern: 'webhook*',
            maxConcurrency: 2,
            handler
        });

        processor.start();
        await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2));
        expect(dequeue).toHaveBeenCalledTimes(1);

        firstHandler.resolve(undefined);
        await vi.waitFor(() => expect(dequeue).toHaveBeenCalledTimes(2));
        expect(dequeue).toHaveBeenNthCalledWith(2, { groupKeyPattern: 'webhook*', limit: 1, longPolling: true });

        const stop = processor.stop();
        secondHandler.resolve(undefined);
        secondDequeue.resolve(Ok([]));
        await stop;
    });
});
