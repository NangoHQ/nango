import { beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';

import { getTestTeam } from '../seeders/account.seeder.js';
import { getTestEnvironment } from '../seeders/environment.seeder.js';
import configService from './config.service.js';
import remoteFileService from './file/remote.service.js';
import { onEventScriptService } from './on-event-scripts.service.js';

import type { DBOnEventScript } from '@nangohq/types';

describe('onEventScriptService.update', () => {
    const environment = getTestEnvironment();
    const account = getTestTeam();

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('throws a clear error instead of an opaque increment crash when the previous on-event script version cannot be auto-incremented', async () => {
        const previousScript: DBOnEventScript = {
            id: 1,
            config_id: 1,
            name: 'post-connection',
            file_location: 'some/path.js',
            version: 'f4a9c21',
            active: true,
            event: 'POST_CONNECTION_CREATION',
            sdk_version: null,
            created_at: new Date(),
            updated_at: new Date()
        };

        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue({ id: 1 } as any);

        vi.spyOn(db.knex, 'transaction').mockImplementation(async (callback: any) => {
            const mockTrx = {
                from: vi.fn().mockReturnValue({
                    whereRaw: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            update: vi.fn().mockReturnValue({
                                returning: vi.fn().mockResolvedValue([previousScript])
                            })
                        })
                    })
                })
            };
            return await callback(mockTrx);
        });

        const uploadSpy = vi.spyOn(remoteFileService, 'upload');

        const update = onEventScriptService.update({
            environment,
            account,
            onEventScriptsByProvider: [
                {
                    providerConfigKey: 'github',
                    scripts: [
                        {
                            name: 'post-connection',
                            fileBody: { js: 'js content', ts: 'ts content' },
                            event: 'post-connection-creation'
                        }
                    ]
                }
            ],
            sdkVersion: '0.0.0'
        });

        await expect(update).rejects.toMatchObject({
            type: 'invalid_previous_sync_version',
            message:
                "Cannot auto-increment the version for 'post-connection': its previous version ('f4a9c21') is not a semver (e.g. '1.0.0') or plain number. Specify an explicit version for this deploy."
        });

        expect(uploadSpy).not.toHaveBeenCalled();
    });
});
