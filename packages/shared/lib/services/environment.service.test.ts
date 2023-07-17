import { expect, describe, it, vi } from 'vitest';
import environmentService from './environment.service.js';
import type { Environment } from '../models/Environment.js';
import encryptionManager from '../utils/encryption.manager.js';

const environmentAccounts = [
    { id: 1, account_id: '123', name: 'env1', secret_key: 'key1' },
    { id: 2, account_id: '456', name: 'env2', secret_key: 'key2' },
    { id: 3, account_id: '789', name: 'env3', secret_key: 'key3' }
];

describe('Environment secret cache', () => {
    it('Caches all secrets as expected', async () => {
        vi.mock('../db/database.js', async () => {
            return {
                default: {
                    schema: () => {
                        return {
                            select: () => {
                                return {
                                    from: () => {
                                        return Promise.resolve(environmentAccounts);
                                    }
                                };
                            }
                        };
                    },
                    knex: {
                        withSchema: () => {
                            return {
                                select: () => {
                                    return {
                                        from: () => {
                                            return Promise.resolve(environmentAccounts);
                                        }
                                    };
                                },
                                from: () => {
                                    return {
                                        insert: (args: any) => {
                                            return Promise.resolve([{ id: 1, ...args }]);
                                        }
                                    };
                                }
                            };
                        }
                    }
                }
            };
        });
        vi.spyOn(encryptionManager, 'decryptEnvironment').mockImplementation((environmentAccount: Environment | null) => {
            return environmentAccount;
        });

        await environmentService.cacheSecrets();
        expect(await environmentService.getAccountIdAndEnvironmentIdBySecretKey('key1')).toEqual({ accountId: '123', environmentId: 1 });
        expect(await environmentService.getAccountIdAndEnvironmentIdBySecretKey('key2')).toEqual({ accountId: '456', environmentId: 2 });
        expect(await environmentService.getAccountIdAndEnvironmentIdBySecretKey('key3')).toEqual({ accountId: '789', environmentId: 3 });
        expect(await environmentService.getAccountIdAndEnvironmentIdBySecretKey('key4')).toEqual(null);
    });
});
