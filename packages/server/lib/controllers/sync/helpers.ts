import { SyncCommand } from '@nangohq/shared';

import type { PostPublicTrigger } from '@nangohq/types';

/** The body may be unparsed: the audit middleware reads it before validation. */
export function syncTriggerCommand(body: Pick<PostPublicTrigger['Body'], 'sync_mode' | 'full_resync' | 'opts'> | undefined): {
    command: SyncCommand;
    deleteRecords: boolean;
} {
    const { sync_mode, full_resync, opts } = body ?? {};

    if (opts) {
        return { command: opts.reset ? SyncCommand.RUN_FULL : SyncCommand.RUN, deleteRecords: opts.emptyCache ?? false };
    }
    return { command: commandFromSyncModeOrFullResync(sync_mode, full_resync), deleteRecords: sync_mode === 'full_refresh_and_clear_cache' };
}

/**
 * Uses sync_mode if provided, otherwise uses full_resync. full_resync is deprecated but maintained for backwards compatibility.
 */
function commandFromSyncModeOrFullResync(sync_mode: PostPublicTrigger['Body']['sync_mode'] | undefined, full_resync: boolean | undefined) {
    if (sync_mode) {
        return sync_mode === 'incremental' ? SyncCommand.RUN : SyncCommand.RUN_FULL;
    }

    return full_resync ? SyncCommand.RUN_FULL : SyncCommand.RUN;
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
