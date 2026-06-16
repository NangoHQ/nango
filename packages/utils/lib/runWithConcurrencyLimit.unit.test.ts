import { describe, expect, it } from 'vitest';

import { runWithConcurrencyLimit } from './runWithConcurrencyLimit.js';

describe('runWithConcurrencyLimit', () => {
    it('should return empty array for empty input', async () => {
        const result = await runWithConcurrencyLimit([], 3, (item) => item);
        expect(result).toStrictEqual([]);
    });

    it('should process all items and preserve result order', async () => {
        const items = [3, 1, 4, 1, 5, 9, 2, 6];
        const result = await runWithConcurrencyLimit(items, 4, (item) => item * 2);
        expect(result).toStrictEqual(items.map((i) => i * 2));
    });

    it('should pass item and index to worker', async () => {
        const items = ['a', 'b', 'c'];
        const calls: [string, number][] = [];
        await runWithConcurrencyLimit(items, 2, (item, index) => {
            calls.push([item, index]);
        });
        expect(calls).toContainEqual(['a', 0]);
        expect(calls).toContainEqual(['b', 1]);
        expect(calls).toContainEqual(['c', 2]);
    });

    it('should respect concurrency limit', async () => {
        let inFlight = 0;
        let maxInFlight = 0;

        const items = Array.from({ length: 20 }, (_, i) => i);
        await runWithConcurrencyLimit(items, 3, async (item) => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await Promise.resolve();
            inFlight--;
            return item;
        });

        expect(maxInFlight).toBeLessThanOrEqual(3);
        expect(maxInFlight).toBe(3);
    });

    it('should clamp concurrency to item count', async () => {
        let maxInFlight = 0;
        let inFlight = 0;

        const items = [1, 2];
        await runWithConcurrencyLimit(items, 10, async (item) => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await Promise.resolve();
            inFlight--;
            return item;
        });

        expect(maxInFlight).toBe(2);
    });

    it('should process items sequentially when concurrency is 1', async () => {
        const order: number[] = [];

        const items = [0, 1, 2, 3];
        await runWithConcurrencyLimit(items, 1, async (item) => {
            order.push(item);
            await Promise.resolve();
        });

        expect(order).toStrictEqual([0, 1, 2, 3]);
    });
});
