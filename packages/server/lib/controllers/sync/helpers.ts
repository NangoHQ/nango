export function normalizeSyncParams(syncs: (string | { name: string; variant: string })[]): { syncName: string; syncVariant: string }[] {
    return syncs.map((sync) => {
        if (typeof sync === 'string') {
            if (sync.includes('::')) {
                const [name, variant] = sync.split('::');
                return { syncName: name ?? '', syncVariant: variant ?? '' };
            }
            return { syncName: sync, syncVariant: 'base' };
        }

        return { syncName: sync.name, syncVariant: sync.variant };
    });
}
