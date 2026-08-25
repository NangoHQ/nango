import { SyncCommand } from '@nangohq/shared';

import type { PostPublicTrigger } from '@nangohq/types';

export interface SyncTriggerOptions {
    reset: boolean;
    emptyCache: boolean;
}

/** The body may be unparsed: the audit middleware reads it before validation. */
export function syncTriggerOptions(body: Pick<PostPublicTrigger['Body'], 'sync_mode' | 'full_resync' | 'opts'> | undefined): SyncTriggerOptions {
    const { sync_mode, full_resync, opts } = body ?? {};

    if (opts) {
        return { reset: Boolean(opts.reset), emptyCache: opts.emptyCache ?? false };
    }
    // sync_mode and full_resync are deprecated spellings of the same two options.
    return {
        reset: sync_mode ? sync_mode !== 'incremental' : Boolean(full_resync),
        emptyCache: sync_mode === 'full_refresh_and_clear_cache'
    };
}

export function syncTriggerCommand(options: SyncTriggerOptions): { command: SyncCommand; deleteRecords: boolean } {
    return { command: options.reset ? SyncCommand.RUN_FULL : SyncCommand.RUN, deleteRecords: options.emptyCache };
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
