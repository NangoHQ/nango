import type { ObjectStore } from './types.js';

/**
 * Copies one object, possibly between stores. Within one store it's a server-side copy; across stores the
 * content goes through this process, which is fine for the small text files Nango stores (compiled
 * functions and their sources).
 */
export async function copyObject({
    from,
    to,
    sourceKey,
    destinationKey
}: {
    from: ObjectStore;
    to: ObjectStore;
    sourceKey: string;
    destinationKey: string;
}): Promise<void> {
    if (from === to) {
        await from.copy(sourceKey, destinationKey);
        return;
    }
    await to.put(destinationKey, await from.get(sourceKey));
}
