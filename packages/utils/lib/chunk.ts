/**
 * Splits `items` into chunks using an accumulator to track chunk state.
 *
 * `reduce` updates the accumulator as each item is added.
 * `wouldOverflow` is called *before* adding an item — if it returns true and the
 * current chunk is non-empty, the chunk is sealed and a new one starts.
 * An item that overflows on its own is placed alone in its chunk.
 *
 * @example
 * // Chunk by count and byte size
 * chunk(
 *   entries,
 *   { count: 0, bytes: 0 },
 *   (acc, item) => ({ count: acc.count + 1, bytes: acc.bytes + item.byteSize }),
 *   (acc, item) => acc.count >= 10 || acc.bytes + item.byteSize > MAX_BYTES
 * );
 */
export function chunk<T, Acc>(items: T[], initialAcc: Acc, reduce: (acc: Acc, item: T) => Acc, wouldOverflow: (acc: Acc, item: T) => boolean): T[][] {
    const chunks: T[][] = [];
    let currentChunk: T[] = [];
    let acc = initialAcc;

    for (const item of items) {
        if (currentChunk.length > 0 && wouldOverflow(acc, item)) {
            chunks.push(currentChunk);
            currentChunk = [];
            acc = initialAcc;
        }
        currentChunk.push(item);
        acc = reduce(acc, item);
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}
