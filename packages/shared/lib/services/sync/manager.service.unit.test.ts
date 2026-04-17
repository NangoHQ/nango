import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import accountService from '../account.service.js';
import configService from '../config.service.js';
import connectionService from '../connection.service.js';
import { SyncManagerService } from './manager.service.js';
import * as syncService from './sync.service.js';
import { SyncCommand } from '../../models/Sync.js';

import type { Orchestrator, RecordsServiceInterface } from '../../clients/orchestrator.js';
import type { Config as ProviderConfig } from '../../models/Provider.js';
import type { Sync } from '../../models/Sync.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { DBConnectionDecrypted, DBEnvironment, DBTeam } from '@nangohq/types';

describe('SyncManagerService.runSyncCommand', () => {
    const service = new SyncManagerService();

    const environment = { id: 1, name: 'dev' } as unknown as DBEnvironment;
    const provider = { id: 10, unique_key: 'github', provider: 'github' } as unknown as ProviderConfig;
    const account = { id: 20, name: 'Acme' } as unknown as DBTeam;
    const connection = { id: 30, connection_id: 'conn-1' } as unknown as DBConnectionDecrypted;
    const sync = { id: 'sync-1', name: 'users', variant: 'base' } as unknown as Sync;
    const logCtx = {
        info: vi.fn(() => Promise.resolve(undefined)),
        error: vi.fn(() => Promise.resolve(undefined)),
        success: vi.fn(() => Promise.resolve(undefined)),
        failed: vi.fn(() => Promise.resolve(undefined))
    };
    const logContextGetterMock = {
        create: vi.fn(() => Promise.resolve(logCtx))
    };
    const orchestratorMock = {
        runSyncCommand: vi.fn(() => Promise.resolve(Ok(undefined)))
    };
    const logContextGetter = logContextGetterMock as unknown as LogContextGetter;
    const orchestrator = orchestratorMock as unknown as Orchestrator;
    const recordsService = {} as unknown as RecordsServiceInterface;

    beforeEach(() => {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(provider);
        vi.spyOn(accountService, 'getAccountFromEnvironment').mockResolvedValue(account);
        vi.spyOn(connectionService, 'getConnection').mockResolvedValue({ success: true, error: null, response: connection });
        vi.spyOn(syncService, 'getSync').mockResolvedValue(sync);
        logContextGetterMock.create.mockResolvedValue(logCtx);
        orchestratorMock.runSyncCommand.mockResolvedValue(Ok(undefined));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns a failure when orchestrator rejects the sync command', async () => {
        orchestratorMock.runSyncCommand.mockResolvedValue(Err(new Error('already running')));

        const result = await service.runSyncCommand({
            recordsService,
            orchestrator,
            environment,
            providerConfigKey: 'github',
            syncIdentifiers: [{ syncName: 'users', syncVariant: 'base' }],
            command: SyncCommand.RUN,
            logContextGetter,
            connectionId: 'conn-1',
            initiator: 'UI',
            operationLogId: '1713550000000_abcdEFGH'
        });

        expect(result.success).toBe(false);
        expect(logCtx.failed).toHaveBeenCalledTimes(1);
    });

    it('returns success when orchestrator accepts the sync command', async () => {
        const result = await service.runSyncCommand({
            recordsService,
            orchestrator,
            environment,
            providerConfigKey: 'github',
            syncIdentifiers: [{ syncName: 'users', syncVariant: 'base' }],
            command: SyncCommand.RUN,
            logContextGetter,
            connectionId: 'conn-1',
            initiator: 'UI',
            operationLogId: '1713550000000_abcdEFGH'
        });

        expect(result.success).toBe(true);
        expect(logCtx.success).toHaveBeenCalledTimes(1);
    });
});
