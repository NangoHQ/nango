export async function runWithConcurrencyLimit<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    const workerCount = Math.min(concurrency, items.length);
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
