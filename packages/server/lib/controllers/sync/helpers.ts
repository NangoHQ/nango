import type { PostPublicTrigger } from '@nangohq/types';

export function syncRunMode(body: Pick<PostPublicTrigger['Body'], 'sync_mode' | 'full_resync' | 'opts'> | undefined): {
    full: boolean;
    deleteRecords: boolean;
} {
    const { sync_mode, full_resync, opts } = body ?? {};
    if (opts) {
        return { full: Boolean(opts.reset), deleteRecords: opts.emptyCache ?? false };
    }
    return {
        full: sync_mode ? sync_mode !== 'incremental' : Boolean(full_resync),
        deleteRecords: sync_mode === 'full_refresh_and_clear_cache'
    };
}

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
