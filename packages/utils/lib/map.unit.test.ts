import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FixedSizeMap, TTLFixedSizeMap } from './map.js';

describe('FixedSizeMap', () => {
    describe('basic operations', () => {
        it('should throw if maxSize is <= 0', () => {
            expect(() => new FixedSizeMap<string, number>(0)).toThrow('maxSize must be a positive integer.');
            expect(() => new FixedSizeMap<string, number>(-1)).toThrow('maxSize must be a positive integer.');
        });
        it('should set and get values', () => {
            const map = new FixedSizeMap<string, number>(10);

            map.set('key1', 100);
            map.set('key2', 200);

            expect(map.get('key1')).toBe(100);
            expect(map.get('key2')).toBe(200);
        });

        it('should return undefined for non-existent keys', () => {
            const map = new FixedSizeMap<string, number>(10);

            expect(map.get('nonexistent')).toBeUndefined();
        });

        it('should check if key exists with has()', () => {
            const map = new FixedSizeMap<string, number>(10);

            map.set('key1', 100);

            expect(map.has('key1')).toBe(true);
            expect(map.has('key2')).toBe(false);
        });

        it('should delete entries', () => {
            const map = new FixedSizeMap<string, number>(10);

            map.set('key1', 100);
            expect(map.has('key1')).toBe(true);

            const deleted = map.delete('key1');

            expect(deleted).toBe(true);
            expect(map.has('key1')).toBe(false);
            expect(map.get('key1')).toBeUndefined();
        });

        it('should return false when deleting non-existent key', () => {
            const map = new FixedSizeMap<string, number>(10);

            const deleted = map.delete('nonexistent');

            expect(deleted).toBe(false);
        });

        it('should clear all entries', () => {
            const map = new FixedSizeMap<string, number>(10);

            map.set('key1', 100);
            map.set('key2', 200);
            map.set('key3', 300);

            expect(map.size).toBe(3);

            map.clear();

            expect(map.size).toBe(0);
            expect(map.has('key1')).toBe(false);
            expect(map.has('key2')).toBe(false);
            expect(map.has('key3')).toBe(false);
        });

        it('should track size correctly', () => {
            const map = new FixedSizeMap<string, number>(10);

            expect(map.size).toBe(0);

            map.set('key1', 100);
            expect(map.size).toBe(1);

            map.set('key2', 200);
            expect(map.size).toBe(2);

            map.delete('key1');
            expect(map.size).toBe(1);

            map.clear();
            expect(map.size).toBe(0);
        });
    });

    describe('size limit enforcement', () => {
        it('should not exceed max size', () => {
            const map = new FixedSizeMap<string, number>(3);

            map.set('key1', 1);
            map.set('key2', 2);
            map.set('key3', 3);

            expect(map.size).toBe(3);

            map.set('key4', 4);

            expect(map.size).toBe(3);
        });

        it('should evict oldest entry when at capacity', () => {
            const map = new FixedSizeMap<string, number>(3);

            map.set('key1', 1);
            map.set('key2', 2);
            map.set('key3', 3);
            map.set('key4', 4);

            expect(map.has('key1')).toBe(false);
            expect(map.has('key2')).toBe(true);
            expect(map.has('key3')).toBe(true);
            expect(map.has('key4')).toBe(true);
            expect(map.size).toBe(3);
        });

        it('should evict in FIFO order when at capacity', () => {
            const map = new FixedSizeMap<string, number>(3);

            map.set('key1', 1);
            map.set('key2', 2);
            map.set('key3', 3);
            map.set('key4', 4); // evicts key1
            map.set('key5', 5); // evicts key2

            expect(map.has('key1')).toBe(false);
            expect(map.has('key2')).toBe(false);
            expect(map.has('key3')).toBe(true);
            expect(map.has('key4')).toBe(true);
            expect(map.has('key5')).toBe(true);
        });
    });

    describe('LRU behavior on writes', () => {
        it('should update existing key without changing size', () => {
            const map = new FixedSizeMap<string, number>(3);

            map.set('key1', 1);
            map.set('key2', 2);

            expect(map.size).toBe(2);

            map.set('key1', 100);

            expect(map.size).toBe(2);
            expect(map.get('key1')).toBe(100);
        });

        it('should move re-inserted key to most recent position', () => {
            const map = new FixedSizeMap<string, number>(3);

            map.set('key1', 1);
            map.set('key2', 2);
            map.set('key3', 3);

            // Re-insert key1, making it most recent
            map.set('key1', 100);

            // Adding key4 should now evict key2 (oldest), not key1
            map.set('key4', 4);

            expect(map.has('key1')).toBe(true);
            expect(map.has('key2')).toBe(false);
            expect(map.has('key3')).toBe(true);
            expect(map.has('key4')).toBe(true);
        });

        it('should handle multiple re-insertions correctly', () => {
            const map = new FixedSizeMap<string, number>(3);

            map.set('key1', 1);
            map.set('key2', 2);
            map.set('key3', 3);

            // Re-insert
            map.set('key1', 10);
            map.set('key2', 20);
            map.set('key1', 100);

            // Order should now be: key3 (oldest), key2, key1 (newest)
            // Adding key4 should evict key3
            map.set('key4', 4);

            expect(map.has('key1')).toBe(true);
            expect(map.has('key2')).toBe(true);
            expect(map.has('key3')).toBe(false); // evicted
            expect(map.has('key4')).toBe(true);
        });
    });
});

describe('TTLFixedSizeMap', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['hrtime'] });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should return entries younger than the TTL', () => {
        const map = new TTLFixedSizeMap<string, number>(10, 60_000);
        map.set('a', 1);
        vi.advanceTimersByTime(59_999);
        expect(map.get('a')).toBe(1);
    });

    it('should return undefined for missing keys', () => {
        const map = new TTLFixedSizeMap<string, number>(10, 60_000);
        expect(map.get('missing')).toBeUndefined();
    });

    it('should expire and evict entries once the TTL elapses', () => {
        const map = new TTLFixedSizeMap<string, number>(10, 60_000);
        map.set('a', 1);
        vi.advanceTimersByTime(60_000);
        expect(map.get('a')).toBeUndefined();
        // The expired read evicted the entry entirely
        expect(map.size).toBe(0);
    });

    it('should reset the TTL when an entry is rewritten', () => {
        const map = new TTLFixedSizeMap<string, number>(10, 60_000);
        map.set('a', 1);
        vi.advanceTimersByTime(50_000);
        map.set('a', 2);
        vi.advanceTimersByTime(30_000);
        expect(map.get('a')).toBe(2);
    });

    it('should accept a non-integer TTL', () => {
        const map = new TTLFixedSizeMap<string, number>(10, 1500.5);
        map.set('a', 1);
        expect(map.get('a')).toBe(1);
        vi.advanceTimersByTime(1500);
        expect(map.get('a')).toBeUndefined();
    });

    it('should evict the least recently written entry at capacity', () => {
        const map = new TTLFixedSizeMap<string, number>(2, 60_000);
        map.set('a', 1);
        map.set('b', 2);
        map.set('c', 3);
        expect(map.get('a')).toBeUndefined();
        expect(map.get('b')).toBe(2);
        expect(map.get('c')).toBe(3);
        expect(map.size).toBe(2);
    });
});
