/**
 * A Fixed-Size Map implementation with write-based eviction policy.
 *
 * This class maintains a map with a maximum size. When the size limit is reached,
 * the least recently written entry is automatically evicted upon adding a new entry.
 *
 * Important: Only write operations (set) update an entry's position, NOT read operations (get).
 * This means entries are evicted based on when they were last written, not when they were last accessed.
 * This is intentional to avoid the performance overhead of reordering on every read.
 *
 * @example
 * ```typescript
 * const cache = new FixedSizeMap<string, number>(1000);
 * cache.set('key1', 100);    // Marks key1 as most recent
 * cache.get('key1');         // Does NOT update position
 * cache.set('key1', 200);    // Updates position again
 * ```
 *
 * Performance characteristics:
 * - get: O(1) - simple lookup, no reordering
 * - set: O(1) - may delete and re-add to maintain write order
 * - Memory: O(maxSize) bounded
 */
export class FixedSizeMap<K, V> {
    private map: Map<K, V>;
    private maxSize: number;

    constructor(maxSize: number) {
        if (maxSize <= 0) {
            throw new Error('maxSize must be a positive integer.');
        }
        this.map = new Map<K, V>();
        this.maxSize = maxSize;
    }

    get(key: K): V | undefined {
        return this.map.get(key);
    }

    set(key: K, value: V): void {
        // If key already exists, delete it first to maintain insertion order
        // We are paying a small price in performance for this
        // in order to keep frequently updated entries in the cache.
        if (this.map.has(key)) {
            this.map.delete(key);
        }
        // If at capacity, remove oldest entry (ie: first item in Map)
        else if (this.map.size >= this.maxSize) {
            const firstKey = this.map.keys().next().value as K;
            this.map.delete(firstKey);
        }

        this.map.set(key, value);
    }

    has(key: K): boolean {
        return this.map.has(key);
    }

    delete(key: K): boolean {
        return this.map.delete(key);
    }

    clear(): void {
        this.map.clear();
    }

    get size(): number {
        return this.map.size;
    }
}
