import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Batcher } from './batcher.js';

describe('Batcher', () => {
    let mockProcess: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockProcess = vi.fn().mockResolvedValue(undefined);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('add', () => {
        it('should add an item to the queue', () => {
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 3 });
            const res = batcher.add('item1');
            expect(res.isOk()).toBe(true);
            expect(batcher['queue']).toEqual([{ item: 'item1', retries: 0 }]);
        });

        it('should return Err if queue is full', () => {
            const batcher = new Batcher({
                process: () => {
                    throw new Error('items are not sent');
                },
                maxBatchSize: 1,
                maxQueueSize: 1
            });
            const res = batcher.add('item1', 'item2');
            expect(res.isErr()).toBe(true);
            if (res.isErr()) {
                expect(res.error.message).toBe('Batcher is full. 1 items are being discarded.');
            }
            expect(batcher['queue'].length).toBe(1);
        });

        it('should auto-flush when maxBatchSize is reached', () => {
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 2 });
            const flushSpy = vi.spyOn(batcher, 'flush');

            batcher.add('item1');
            expect(flushSpy).not.toHaveBeenCalled();
            expect(batcher['queue'].length).toBe(1);

            batcher.add('item2'); // Reaches batch size
            expect(flushSpy).toHaveBeenCalledTimes(1);

            expect(mockProcess).toHaveBeenCalledWith(['item1', 'item2']);
            expect(batcher['queue'].length).toBe(0);
        });
    });

    describe('flush', () => {
        it('should do nothing if already processing', async () => {
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 3 });
            batcher.add('item1');
            batcher['isFlushing'] = true; // Simulate processing state
            const res = await batcher.flush();
            expect(res.isOk()).toBe(true);
            expect(mockProcess).not.toHaveBeenCalled();
        });

        it('should do nothing if queue is empty', async () => {
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 3 });
            const res = await batcher.flush();
            expect(res.isOk()).toBe(true);
            expect(mockProcess).not.toHaveBeenCalled();
        });

        it('should process all items when queue <= maxBatchSize', async () => {
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 3 });
            batcher.add('item1');
            const res = await batcher.flush();
            expect(res.isOk()).toBe(true);
            expect(mockProcess).toHaveBeenCalledTimes(1);
            expect(mockProcess).toHaveBeenCalledWith(['item1']);
            expect(batcher['queue'].length).toBe(0);
        });

        it('should process maxBatchSize items when queue > maxBatchSize', async () => {
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 3 });
            batcher.add('item1', 'item2', 'item3', 'item4');
            const res = await batcher.flush();
            expect(res.isOk()).toBe(true);
            expect(mockProcess).toHaveBeenCalledTimes(1);
            expect(mockProcess).toHaveBeenCalledWith(['item1', 'item2', 'item3']);
            expect(batcher['queue'].length).toBe(1);
        });

        it('should handle processing failure and retry items successfully', async () => {
            let attempt = 0;
            // eslint-disable-next-line @typescript-eslint/require-await
            const processFn = vi.fn(async () => {
                attempt++;
                if (attempt === 1) {
                    throw new Error('Simulated processing failure');
                } else {
                    return;
                }
            });

            const batcher = new Batcher({
                process: processFn,
                maxBatchSize: 2,
                maxProcessingRetry: 1
            });

            batcher.add('item1');
            batcher.add('item2');

            await Promise.resolve(); // Allow the auto-flush to complete

            expect(batcher['queue'].length).toBe(2);
            expect(batcher['queue'][0]).toEqual({ item: 'item1', retries: 1 });
            expect(batcher['queue'][1]).toEqual({ item: 'item2', retries: 1 });

            // retrying to flush
            const res = await batcher.flush();
            expect(res.isOk()).toBe(true);
            expect(processFn).toHaveBeenCalledTimes(2);
            expect(processFn).toHaveBeenLastCalledWith(['item1', 'item2']);
            expect(batcher['queue']).toEqual([]);
        });

        it('should discard items after maxProcessingRetry attempts', () => {
            const processFn = vi.fn(() => {
                throw new Error('Simulated processing failure');
            });

            const batcher = new Batcher({
                process: processFn,
                maxBatchSize: 2,
                maxProcessingRetry: 0
            });

            batcher.add('item1');
            batcher.add('item2'); // This should trigger an auto-flush

            expect(batcher['queue'].length).toBe(0);
        });
    });

    describe('interval flushing', () => {
        it('should flush periodically based on flushInterval', async () => {
            const flushInterval = 100;
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 5, flushIntervalMs: flushInterval });
            const flushSpy = vi.spyOn(batcher, 'flush');

            batcher.add('item1');
            expect(flushSpy).not.toHaveBeenCalled();

            // Interval not yet reached
            vi.advanceTimersByTime(flushInterval / 2);
            expect(flushSpy).not.toHaveBeenCalled();

            // Interval reached
            vi.advanceTimersByTime(flushInterval / 2);
            expect(flushSpy).toHaveBeenCalledTimes(1);
            expect(mockProcess).toHaveBeenCalledWith(['item1']);

            // Add more items to meet batchSize for a subsequent interval flush
            batcher.add('item2');
            batcher.add('item3');
            batcher.add('item4');
            batcher.add('item5');
            await Promise.resolve(); // allow auto-flush to complete
            vi.advanceTimersByTime(flushInterval);

            expect(mockProcess).toHaveBeenCalledWith(['item2', 'item3', 'item4', 'item5']);
            expect(batcher['queue'].length).toBe(0);
            mockProcess.mockClear();
            flushSpy.mockClear();
        });
    });

    describe('aggregate', () => {
        it('should aggregate items correctly', () => {
            const batcher = new Batcher({
                process: mockProcess,
                grouping: {
                    groupingKey: (item: { id: string; type: string; value: number }) => `${item.id}${item.type}`,
                    aggregate: (a, b) => {
                        return { id: a.id, type: a.type, value: a.value + b.value };
                    }
                },
                maxBatchSize: 5
            });

            const items = [
                { item: { id: 'A', type: 'TA1', value: 1 }, retries: 0 },
                { item: { id: 'B', type: 'TB1', value: 2 }, retries: 0 },
                { item: { id: 'A', type: 'TA1', value: 3 }, retries: 0 },
                { item: { id: 'C', type: 'TC1', value: 4 }, retries: 1 },
                { item: { id: 'B', type: 'TB1', value: 5 }, retries: 1 },
                { item: { id: 'A', type: 'TA2', value: 10 }, retries: 0 } // different type, should not be aggregated with other A items
            ];

            const aggregated = (batcher as any).aggregateItems(items);
            expect(aggregated).toEqual([
                { item: { id: 'A', type: 'TA1', value: 4 }, retries: 0 },
                { item: { id: 'B', type: 'TB1', value: 7 }, retries: 0 },
                { item: { id: 'C', type: 'TC1', value: 4 }, retries: 1 },
                { item: { id: 'A', type: 'TA2', value: 10 }, retries: 0 }
            ]);
        });
    });

    describe('shutdown', () => {
        it('should clear the timer', async () => {
            const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 3, flushIntervalMs: 1_000 });
            expect(batcher['timer']).not.toBeNull();

            await batcher.shutdown();
            expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
            expect(batcher['timer']).toBeNull();
            clearIntervalSpy.mockRestore();
        });
        it('should process remaining items in the queue', async () => {
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 5 });
            batcher.add('item1');
            batcher.add('item2');

            const res = await batcher.shutdown();
            expect(res.isOk()).toBe(true);
            expect(mockProcess).toHaveBeenCalledTimes(1);
            expect(mockProcess).toHaveBeenCalledWith(['item1', 'item2']);
            expect(batcher['queue']).toEqual([]);
        });

        it('should return Err if processing fails during shutdown flush', async () => {
            const shutdownError = new Error('Shutdown process fail');
            mockProcess.mockRejectedValueOnce(shutdownError);
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 5 });
            batcher.add('item1');

            const res = await batcher.shutdown();
            expect(res.isErr()).toBe(true);
            if (res.isErr()) {
                expect(res.error.message).toBe('Batcher failed to process batch');
                expect(res.error.cause).toBe(shutdownError);
            }
            expect(batcher['queue'].length).toBe(1);
            expect(batcher['queue'][0]?.retries).toBe(1);
        });

        it('should return successfully when queue is empty and not processing', async () => {
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 1, flushIntervalMs: 0 });
            const res = await batcher.shutdown();
            expect(res.isOk()).toBe(true);
            expect(mockProcess).not.toHaveBeenCalled();
        });
        it('should return error from shutdown if a forced flush fails and items are discarded (max retries)', async () => {
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 10, maxProcessingRetry: 0 });
            batcher.add('item1');

            const processError = new Error('Processing failed');
            mockProcess.mockRejectedValueOnce(processError);

            const res = await batcher.shutdown({ timeoutMs: 100 });

            expect(res.isErr()).toBe(true);
            if (res.isErr()) {
                expect(res.error.message).toBe('Batcher failed to process batch');
                expect(res.error.cause).toBe(processError);
            }
            expect(mockProcess).toHaveBeenCalledTimes(1);
            expect(mockProcess).toHaveBeenCalledWith(['item1']);
            expect(batcher['queue']).toEqual([]);
        });
    });
});
