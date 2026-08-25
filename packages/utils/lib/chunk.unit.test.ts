import { describe, expect, it } from 'vitest';

import { chunk } from './chunk.js';

describe('chunk', () => {
    it('should return empty array for empty input', () => {
        const result = chunk(
            [],
            () => 0,
            (acc, _) => acc,
            () => false
        );
        expect(result).toStrictEqual([]);
    });

    it('should chunk by count', () => {
        const items = [1, 2, 3, 4, 5];
        const result = chunk(
            items,
            () => 0,
            (acc) => acc + 1,
            (acc) => acc >= 2
        );
        expect(result).toStrictEqual([[1, 2], [3, 4], [5]]);
    });

    it('should chunk by size', () => {
        const items = [
            { value: 'a', size: 10 },
            { value: 'b', size: 10 },
            { value: 'c', size: 5 },
            { value: 'd', size: 10 }
        ];
        const result = chunk(
            items,
            () => 0,
            (acc, item) => acc + item.size,
            (acc, item) => acc + item.size > 20
        );
        expect(result).toStrictEqual([
            [items[0], items[1]],
            [items[2], items[3]]
        ]);
    });

    it('should chunk by both count and size', () => {
        const items = [
            { value: 'a', size: 5 },
            { value: 'b', size: 5 },
            { value: 'c', size: 5 }, // triggers count limit
            { value: 'd', size: 15 },
            { value: 'e', size: 15 }, // triggers byte limit (15+15 > 20)
            { value: 'f', size: 5 }
        ];
        const result = chunk(
            items,
            () => ({ count: 0, bytes: 0 }),
            (acc, item) => ({ count: acc.count + 1, bytes: acc.bytes + item.size }),
            (acc, item) => acc.count >= 3 || acc.bytes + item.size > 20
        );
        expect(result).toStrictEqual([[items[0], items[1], items[2]], [items[3]], [items[4], items[5]]]);
    });

    it('should place oversized item alone in its chunk', () => {
        const items = [
            { value: 'a', size: 5 },
            { value: 'b', size: 100 },
            { value: 'c', size: 5 }
        ];
        const result = chunk(
            items,
            () => 0,
            (acc, item) => acc + item.size,
            (acc, item) => acc + item.size > 20
        );
        expect(result).toStrictEqual([[items[0]], [items[1]], [items[2]]]);
    });

    it('should put all items in one chunk when no overflow occurs', () => {
        const items = [1, 2, 3];
        const result = chunk(
            items,
            () => 0,
            (acc) => acc + 1,
            (acc) => acc >= 10
        );
        expect(result).toStrictEqual([[1, 2, 3]]);
    });

    it('should not share accumulator state across chunks with in-place reducers', () => {
        const items = [1, 2, 3, 4];
        const result = chunk(
            items,
            () => ({ ids: [] as number[] }),
            (acc, item) => {
                acc.ids.push(item);
                return acc;
            },
            (acc) => acc.ids.length >= 2
        );
        expect(result).toStrictEqual([
            [1, 2],
            [3, 4]
        ]);
        expect(result[0]).not.toBe(result[1]);
    });
});
