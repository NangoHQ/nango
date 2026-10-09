import { afterEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { Ok } from '@nangohq/utils';

import { errorNotificationService } from '../notification/error.service.js';
import syncManager from './manager.service.js';
import * as syncService from './sync.service.js';

import type { Orchestrator } from '../../clients/orchestrator.js';
import type { SyncWithConnectionId } from '../../models/Sync.js';

function makeSyncs(ids: string[]): SyncWithConnectionId[] {
    return ids.map((id) => ({ id }) as unknown as SyncWithConnectionId);
}

describe('syncManager batch deletion', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('deleteSyncsByProviderConfig unschedules all syncs in a single orchestrator call, not one per sync', async () => {
        const syncIds = ['sync-1', 'sync-2', 'sync-3'];
        vi.spyOn(syncService, 'getSyncsByProviderConfigKey').mockResolvedValue(makeSyncs(syncIds));
        vi.spyOn(syncService, 'softDeleteSyncs').mockResolvedValue(Ok(syncIds));
        vi.spyOn(errorNotificationService.sync, 'clearBySyncIds').mockResolvedValue(undefined);
        vi.spyOn(db.knex, 'transaction').mockImplementation((async (cb: (trx: unknown) => Promise<unknown>) => cb({})) as typeof db.knex.transaction);

        const deleteSyncs = vi.fn().mockResolvedValue(Ok(undefined));
        const orchestrator = { deleteSyncs } as unknown as Pick<Orchestrator, 'deleteSyncs'>;

        await syncManager.deleteSyncsByProviderConfig(1, 'github', orchestrator);

        expect(deleteSyncs).toHaveBeenCalledTimes(1);
        expect(deleteSyncs).toHaveBeenCalledWith({ syncIds, environmentId: 1 });
        expect(syncService.softDeleteSyncs).toHaveBeenCalledTimes(1);
        expect(syncService.softDeleteSyncs).toHaveBeenCalledWith(syncIds, expect.anything());
        expect(errorNotificationService.sync.clearBySyncIds).toHaveBeenCalledTimes(1);
        expect(errorNotificationService.sync.clearBySyncIds).toHaveBeenCalledWith({ sync_ids: syncIds, trx: expect.anything() });
    });

    it('deleteSyncsByProviderConfig does nothing when there are no syncs', async () => {
        vi.spyOn(syncService, 'getSyncsByProviderConfigKey').mockResolvedValue([]);
        const deleteSyncs = vi.fn().mockResolvedValue(Ok(undefined));
        const orchestrator = { deleteSyncs } as unknown as Pick<Orchestrator, 'deleteSyncs'>;

        await syncManager.deleteSyncsByProviderConfig(1, 'github', orchestrator);

        expect(deleteSyncs).not.toHaveBeenCalled();
    });

    it('softDeleteSyncsByConnection unschedules all syncs in a single orchestrator call, not one per sync', async () => {
        const syncIds = ['sync-1', 'sync-2'];
        vi.spyOn(syncService, 'getSyncsByConnectionId').mockResolvedValue(makeSyncs(syncIds));
        vi.spyOn(syncService, 'softDeleteSyncs').mockResolvedValue(Ok(syncIds));
        vi.spyOn(errorNotificationService.sync, 'clearBySyncIds').mockResolvedValue(undefined);
        vi.spyOn(db.knex, 'transaction').mockImplementation((async (cb: (trx: unknown) => Promise<unknown>) => cb({})) as typeof db.knex.transaction);

        const deleteSyncs = vi.fn().mockResolvedValue(Ok(undefined));
        const orchestrator = { deleteSyncs } as unknown as Pick<Orchestrator, 'deleteSyncs'>;

        await syncManager.softDeleteSyncsByConnection({ id: 42, environment_id: 1 }, orchestrator);

        expect(deleteSyncs).toHaveBeenCalledTimes(1);
        expect(deleteSyncs).toHaveBeenCalledWith({ syncIds, environmentId: 1 });
    });
});
