import { expect, describe, it, vi } from 'vitest';
import environmentService from './environment.service.js';
import type { Environment } from '../models/Environment.js';
import encryptionManager from '../utils/encryption.manager.js';

const environmentAccounts = [
    { id: 1, account_id: '123', name: 'env1', secret_key: 'key1' },
    { id: 2, account_id: '456', name: 'env2', secret_key: 'key2' },
    { id: 3, account_id: '789', name: 'env3', secret_key: 'key3' }
];
const extraAccount = { id: 4, account_id: '1011', name: 'env4', secret_key: 'key4' };

describe('Environment service', () => {
    it('can retrieve secrets', async () => {
        vi.mock('../db/database.js', async () => {
            const actual = (await vi.importActual('../db/database.js')) as any;
            return {
                default: {
                    schema: actual.schema,
                    knex: {
                        withSchema: () => {
                            return {
                                select: () => {
                                    return {
                                        from: () =>
                                            new Proxy(
                                                {
                                                    where: ({ secret_key }: { secret_key: string }) => {
                                                        return {
                                                            first: () => {
                                                                if (secret_key === extraAccount.secret_key) {
                                                                    return Promise.resolve(extraAccount);
                                                                } else {
                                                                    return Promise.resolve(null);
                                                                }
                                                            }
                                                        };
                                                    }
                                                },
                                                {
                                                    get(target, prop, receiver) {
                                                        if (prop === Symbol.iterator) {
                                                            return function* () {
                                                                yield* environmentAccounts;
                                                            };
                                                        }
                                                        return Reflect.get(target, prop, receiver);
                                                    }
                                                }
                                            )
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
        vi.spyOn(environmentService as any, 'addToEnvironmentSecretCache');

        await environmentService.cacheSecrets();
        expect(await environmentService.getAccountIdAndEnvironmentIdBySecretKey('key1')).toEqual({ accountId: '123', environmentId: 1 });
        expect(await environmentService.getAccountIdAndEnvironmentIdBySecretKey('key2')).toEqual({ accountId: '456', environmentId: 2 });
        expect(await environmentService.getAccountIdAndEnvironmentIdBySecretKey('key3')).toEqual({ accountId: '789', environmentId: 3 });
        expect(await environmentService.getAccountIdAndEnvironmentIdBySecretKey('key4')).toEqual({ accountId: '1011', environmentId: 4 });
        expect(await environmentService.getAccountIdAndEnvironmentIdBySecretKey('key5')).toEqual(null);

        // retrieving the same key again should not call addToEnvironmentSecretCache again
        expect(await environmentService.getAccountIdAndEnvironmentIdBySecretKey('key4')).toEqual({ accountId: '1011', environmentId: 4 });
        expect((environmentService as any).addToEnvironmentSecretCache).toHaveBeenCalledTimes(1);
    });
});
