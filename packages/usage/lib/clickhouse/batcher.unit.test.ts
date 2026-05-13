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
            expect(batcher['queue']).toEqual(['item1']);
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
                expect(res.error.message).toContain('batcher is full. 1 items are being discarded.');
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

            expect(mockProcess).toHaveBeenCalledWith(['item1', 'item2'], expect.objectContaining({ retryKey: expect.any(String) }));
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
            expect(mockProcess).toHaveBeenCalledWith(['item1'], expect.objectContaining({ retryKey: expect.any(String) }));
            expect(batcher['queue'].length).toBe(0);
        });

        it('should process maxBatchSize items when queue > maxBatchSize', async () => {
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 3 });
            batcher.add('item1', 'item2', 'item3', 'item4');
            const res = await batcher.flush();
            expect(res.isOk()).toBe(true);
            expect(mockProcess).toHaveBeenCalledTimes(1);
            expect(mockProcess).toHaveBeenCalledWith(['item1', 'item2', 'item3'], expect.objectContaining({ retryKey: expect.any(String) }));
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

            expect(batcher['queue']).toEqual(['item1', 'item2']);
            expect(batcher['retry']).toEqual(expect.objectContaining({ key: expect.any(String), size: 2, attempts: 1 }));

            // retrying to flush
            const res = await batcher.flush();
            expect(res.isOk()).toBe(true);
            expect(processFn).toHaveBeenCalledTimes(2);
            expect(processFn).toHaveBeenLastCalledWith(['item1', 'item2'], expect.objectContaining({ retryKey: expect.any(String) }));
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
            expect(mockProcess).toHaveBeenCalledWith(['item1'], expect.objectContaining({ retryKey: expect.any(String) }));

            // Add more items to meet batchSize for a subsequent interval flush
            batcher.add('item2');
            batcher.add('item3');
            batcher.add('item4');
            batcher.add('item5');
            await Promise.resolve(); // allow auto-flush to complete
            vi.advanceTimersByTime(flushInterval);

            expect(mockProcess).toHaveBeenCalledWith(['item2', 'item3', 'item4', 'item5'], expect.objectContaining({ retryKey: expect.any(String) }));
            expect(batcher['queue'].length).toBe(0);
            mockProcess.mockClear();
            flushSpy.mockClear();
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
            expect(mockProcess).toHaveBeenCalledWith(['item1', 'item2'], expect.objectContaining({ retryKey: expect.any(String) }));
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
            expect(batcher['queue']).toEqual(['item1']);
            expect(batcher['retry']).toEqual(expect.objectContaining({ size: 1, attempts: 1 }));
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
            expect(mockProcess).toHaveBeenCalledWith(['item1'], expect.objectContaining({ retryKey: expect.any(String) }));
            expect(batcher['queue']).toEqual([]);
        });
    });

    describe('retryKey', () => {
        it('assigns a fresh retryKey to a first flush', async () => {
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 3 });
            batcher.add('a', 'b');
            await batcher.flush();

            expect(mockProcess).toHaveBeenCalledTimes(1);
            const call = mockProcess.mock.calls[0]!;
            expect(call[0]).toEqual(['a', 'b']);
            expect(call[1].retryKey).toMatch(/^[0-9a-f]{8}-/);
        });

        it('preserves the same retryKey across retries', async () => {
            // Fail on first call, succeed on second
            let attempt = 0;
            const processFn = vi.fn<(events: string[], opts: { retryKey: string }) => Promise<void>>(async () => {
                attempt++;
                if (attempt === 1) throw new Error('first call fails');
                return Promise.resolve();
            });

            const batcher = new Batcher({ process: processFn, maxBatchSize: 3, maxProcessingRetry: 2 });
            batcher.add('a', 'b');
            await batcher.flush(); // fails, retries queued
            await batcher.flush(); // retry succeeds

            expect(processFn).toHaveBeenCalledTimes(2);
            const firstCallKey = processFn.mock.calls[0]![1].retryKey;
            const secondCallKey = processFn.mock.calls[1]![1].retryKey;
            expect(firstCallKey).toBeDefined();
            expect(secondCallKey).toBe(firstCallKey);
        });

        it('isolates retried items from fresh items in the next flush', async () => {
            // Fail first call so items get retryKey + retries=1
            const processFn = vi.fn<(events: string[], opts: { retryKey: string }) => Promise<void>>();
            processFn.mockRejectedValueOnce(new Error('fail'));
            processFn.mockResolvedValue(undefined);

            const batcher = new Batcher({ process: processFn, maxBatchSize: 10, maxProcessingRetry: 2 });
            batcher.add('retry-a', 'retry-b');
            await batcher.flush(); // fails, queue = [retry-a, retry-b] with retryKey set

            // New items arrive after the retry was queued
            batcher.add('fresh-x', 'fresh-y');

            // Next flush picks ONLY the retried items (contiguous prefix with shared retryKey)
            await batcher.flush();
            expect(processFn).toHaveBeenLastCalledWith(['retry-a', 'retry-b'], expect.any(Object));
            expect(batcher['queue']).toHaveLength(2); // fresh-x, fresh-y still waiting

            // Subsequent flush picks the fresh items, with a different retryKey
            await batcher.flush();
            expect(processFn).toHaveBeenCalledTimes(3);
            const retryKeys = processFn.mock.calls.map((c) => c[1].retryKey);
            expect(retryKeys[0]).toBe(retryKeys[1]); // original + retry share the key
            expect(retryKeys[2]).not.toBe(retryKeys[0]); // fresh batch gets its own key
        });

        it('produces unique retryKeys for distinct first-time batches', async () => {
            const batcher = new Batcher({ process: mockProcess, maxBatchSize: 1 });
            batcher.add('a');
            await batcher.flush();
            batcher.add('b');
            await batcher.flush();

            expect(mockProcess).toHaveBeenCalledTimes(2);
            const keyA = mockProcess.mock.calls[0]![1].retryKey;
            const keyB = mockProcess.mock.calls[1]![1].retryKey;
            expect(keyA).not.toBe(keyB);
        });
    });
});
