import { runWithConcurrencyLimit } from '@nangohq/utils';

import { envs } from '../../../env.js';

export function formatDeleteError(key: string | undefined, reason: unknown): string {
    const message = reason instanceof Error ? reason.message : typeof reason === 'string' && reason.length > 0 ? reason : 'delete failed';
    return `${key ?? 'unknown'}: ${message}`;
}

export function throwIfDeleteErrors(provider: string, errors: string[]): void {
    if (errors.length === 0) {
        return;
    }
    throw new Error(`Failed to delete ${provider} objects: ${errors.join(', ')}`);
}

export async function deleteEach(keys: string[], deleteOne: (key: string) => Promise<unknown>, provider: string): Promise<void> {
    const results = await runWithConcurrencyLimit(keys, envs.OBJECT_STORE_DELETE_CONCURRENCY, async (key) => {
        try {
            await Promise.resolve().then(() => deleteOne(key));
            return undefined;
        } catch (err) {
            return formatDeleteError(key, err);
        }
    });
    const errors = results.filter((error): error is string => error !== undefined);
    throwIfDeleteErrors(provider, errors);
}
