//import { expect, describe, it, vi } from 'vitest';
import { describe, it, vi } from 'vitest';
import type { IncomingSyncConfig } from '../../models/Sync.js';
import environmentService from '../environment.service.js';
import * as ConfigService from './config.service';
import { mockCreateActivityLog } from '../activity/mocks.js';

describe('SyncConfigService', () => {
    it('Create sync configs correctly', async () => {
        const environment_id = 1;
        const syncs: IncomingSyncConfig[] = [];
        const debug = true;

        vi.spyOn(environmentService, 'getAccountIdFromEnvironment').mockImplementation(() => {
            return Promise.resolve(1);
        });

        mockCreateActivityLog();

        const config = await ConfigService.createSyncConfig(environment_id, syncs, debug);
        console.log(config);
    });
});
