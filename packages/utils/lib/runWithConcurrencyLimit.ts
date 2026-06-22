/**
 * Run `worker` over `items` with at most `concurrency` workers active at once.
 *
 * `concurrency` is clamped to `[1, items.length]`: values ≤ 0 are treated as 1,
 * and values exceeding the item count don't spin up excess workers.
 * Results are returned in the same order as `items`.
 */
export async function runWithConcurrencyLimit<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R> | R): Promise<R[]> {
    const results: R[] = new Array(items.length);
    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    let nextIndex = 0;

    await Promise.all(
        Array.from({ length: workerCount }, async () => {
            while (true) {
                const index = nextIndex++;
                if (index >= items.length) {
                    return;
                }

                results[index] = await worker(items[index]!, index);
            }
        })
    );

    return results;
}
