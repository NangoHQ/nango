import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { DBEnvironment } from '@nangohq/types';

const steps: string[] = [];

const deleteProviderConfigData = vi.fn((..._args: unknown[]) => {
    steps.push('deleteProviderConfigData');
    return Promise.resolve();
});
vi.mock('./deleteProviderConfigData.js', () => ({
    deleteProviderConfigData: (...args: unknown[]) => deleteProviderConfigData(...args)
}));

const hardDelete = vi.fn((..._args: unknown[]) => {
    steps.push('environmentService.hardDelete');
    return Promise.resolve(1);
});
vi.mock('@nangohq/shared', () => ({
    environmentService: { hardDelete: (...args: unknown[]) => hardDelete(...args) }
}));

let configsReturned = false;
const from = vi.fn((table: string) => {
    if (table === '_nango_configs') {
        return {
            where: () => ({
                limit: () => {
                    if (!configsReturned) {
                        configsReturned = true;
                        steps.push('select:_nango_configs');
                        return Promise.resolve([{ id: 7, environment_id: 42, unique_key: 'github' }]);
                    }
                    return Promise.resolve([]);
                }
            })
        };
    }

    return {
        whereIn: (_col: string, subFn: (sub: { select: () => { from: () => { where: () => { limit: () => void } } } }) => void) => {
            subFn({ select: () => ({ from: () => ({ where: () => ({ limit: () => undefined }) }) }) });
            return {
                delete: () => {
                    steps.push(`delete:${table}`);
                    return Promise.resolve(0);
                }
            };
        },
        where: () => ({
            delete: () => {
                steps.push(`delete:${table}`);
                return Promise.resolve(0);
            }
        })
    };
});
vi.mock('@nangohq/database', () => ({ default: { knex: { from } } }));

const { deleteEnvironmentData } = await import('./deleteEnvironmentData.js');

describe('deleteEnvironmentData', () => {
    beforeEach(() => {
        steps.length = 0;
        configsReturned = false;
        deleteProviderConfigData.mockClear();
        hardDelete.mockClear();
        from.mockClear();
    });

    it('deletes provider configs, end users, oauth sessions, webhooks, slack notifications, and env vars before hard-deleting the environment', async () => {
        const environment = { id: 42, name: 'old-dev' } as DBEnvironment;
        const opts: BatchDeleteSharedOptions = {
            deadline: new Date(Date.now() + 60_000),
            limit: 100,
            sleepMs: 0,
            logger: {
                info: vi.fn(),
                error: vi.fn(),
                debug: vi.fn(),
                warning: vi.fn(),
                warn: vi.fn(),
                critical: vi.fn(),
                log: vi.fn()
            } as unknown as BatchDeleteSharedOptions['logger']
        };

        await deleteEnvironmentData(environment, opts);

        expect(steps).toEqual([
            'select:_nango_configs',
            'deleteProviderConfigData',
            'delete:end_users',
            'delete:_nango_oauth_sessions',
            'delete:_nango_external_webhooks',
            'delete:_nango_slack_notifications',
            'delete:_nango_environment_variables',
            'environmentService.hardDelete'
        ]);
        expect(hardDelete).toHaveBeenCalledWith(42);
    });
});
