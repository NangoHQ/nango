import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeletionBudgetExceeded } from './batchDelete.js';

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

const deleteConnectionData = vi.fn((..._args: unknown[]) => {
    steps.push('deleteConnectionData');
    return Promise.resolve();
});
vi.mock('./deleteConnectionData.js', () => ({
    deleteConnectionData: (...args: unknown[]) => deleteConnectionData(...args)
}));

const hardDelete = vi.fn((..._args: unknown[]) => {
    steps.push('environmentService.hardDelete');
    return Promise.resolve(1);
});
vi.mock('@nangohq/shared', () => ({
    environmentService: { hardDelete: (...args: unknown[]) => hardDelete(...args) }
}));

let mockConfigs: { id: number; environment_id: number; unique_key: string }[] = [];
let configsReturned = false;
const from = vi.fn((table: string) => {
    if (table === '_nango_configs') {
        return {
            where: () => ({
                limit: () => {
                    if (!configsReturned) {
                        configsReturned = true;
                        steps.push('select:_nango_configs');
                        return Promise.resolve(mockConfigs);
                    }
                    return Promise.resolve([]);
                }
            })
        };
    }

    if (table === '_nango_connections') {
        return {
            where: () => ({
                limit: () => {
                    steps.push('select:_nango_connections');
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

const makeLogger = (): BatchDeleteSharedOptions['logger'] =>
    ({
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        warning: vi.fn(),
        warn: vi.fn(),
        critical: vi.fn(),
        log: vi.fn()
    }) as unknown as BatchDeleteSharedOptions['logger'];

describe('deleteEnvironmentData', () => {
    beforeEach(() => {
        steps.length = 0;
        mockConfigs = [{ id: 7, environment_id: 42, unique_key: 'github' }];
        configsReturned = false;
        deleteProviderConfigData.mockClear();
        deleteConnectionData.mockClear();
        hardDelete.mockClear();
        from.mockClear();
    });

    it('deletes oauth sessions and connect sessions before provider configs/connections, then remaining environment rows and the environment itself', async () => {
        const environment = { id: 42, name: 'old-dev' } as DBEnvironment;
        const opts: BatchDeleteSharedOptions = {
            deadline: new Date(Date.now() + 60_000),
            limit: 100,
            sleepMs: 0,
            logger: makeLogger()
        };

        await deleteEnvironmentData(environment, opts);

        expect(steps).toEqual([
            'delete:_nango_oauth_sessions',
            'delete:connect_sessions',
            'select:_nango_configs',
            'deleteProviderConfigData',
            'select:_nango_connections',
            'delete:end_users',
            'delete:_nango_external_webhooks',
            'delete:_nango_slack_notifications',
            'delete:_nango_environment_variables',
            'environmentService.hardDelete'
        ]);
        expect(hardDelete).toHaveBeenCalledWith(42);
    });

    it('throws DeletionBudgetExceeded between provider configs after making forward progress even when count < limit', async () => {
        mockConfigs = [
            { id: 7, environment_id: 42, unique_key: 'github' },
            { id: 8, environment_id: 42, unique_key: 'slack' }
        ];
        const environment = { id: 42, name: 'old-dev' } as DBEnvironment;
        const opts: BatchDeleteSharedOptions = {
            deadline: new Date(Date.now() - 1),
            limit: 100,
            sleepMs: 0,
            logger: makeLogger()
        };

        await expect(deleteEnvironmentData(environment, opts)).rejects.toBeInstanceOf(DeletionBudgetExceeded);

        expect(deleteProviderConfigData).toHaveBeenCalledTimes(1);
        expect(hardDelete).not.toHaveBeenCalled();
    });
});
