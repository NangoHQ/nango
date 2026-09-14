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
    const results = await Promise.allSettled(keys.map((key) => deleteOne(key)));
    const errors = results.flatMap((result, i) => {
        if (result.status === 'fulfilled') {
            return [];
        }
        return [formatDeleteError(keys[i], result.reason)];
    });
    throwIfDeleteErrors(provider, errors);
}
