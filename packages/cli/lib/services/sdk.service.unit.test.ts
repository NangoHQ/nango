import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NangoActionBase } from '@nangohq/runner-sdk';

import { NangoSyncCLI } from './sdk.js';

import type { DryRunService } from './dryrun.service.js';

describe('NangoSyncCLI - getConnection', () => {
    let instance: NangoSyncCLI;

    beforeEach(() => {
        const mockDryRunService: DryRunService = {
            run: vi.fn(),
            fullPath: '',
            isZeroYaml: false,
            validation: true,
            runScript: vi.fn()
        };

        instance = new NangoSyncCLI(
            {
                secretKey: 'test-secret-key',
                syncConfig: {
                    models_json_schema: { definitions: {} }
                }
            } as any,
            { dryRunService: mockDryRunService }
        );
    });

    it('should pass options parameter to parent getConnection', async () => {
        const mockConnection = {
            id: 1,
            connection_id: 'test-connection',
            provider_config_key: 'test-provider',
            provider: 'test',
            credentials: { type: 'OAUTH2', access_token: 'token', refresh_token: 'refresh' }
        };

        const parentGetConnectionSpy = vi.spyOn(NangoActionBase.prototype, 'getConnection').mockResolvedValue(mockConnection as any);

        const options = { refreshToken: true, forceRefresh: false };
        await instance.getConnection('provider-key', 'connection-id', options);

        expect(parentGetConnectionSpy).toHaveBeenCalledWith('provider-key', 'connection-id', options);

        parentGetConnectionSpy.mockRestore();
    });

    it('should pass options with refreshGithubAppJwtToken to parent getConnection', async () => {
        const mockConnection = {
            id: 1,
            connection_id: 'test-connection',
            provider_config_key: 'test-provider',
            provider: 'test',
            credentials: { type: 'OAUTH2', access_token: 'token' }
        };

        const parentGetConnectionSpy = vi.spyOn(NangoActionBase.prototype, 'getConnection').mockResolvedValue(mockConnection as any);

        const options = { refreshGithubAppJwtToken: true };
        await instance.getConnection(undefined, undefined, options);

        expect(parentGetConnectionSpy).toHaveBeenCalledWith(undefined, undefined, options);

        parentGetConnectionSpy.mockRestore();
    });
});

describe('NangoSyncCLI - batchSave', () => {
    let instance: NangoSyncCLI;

    beforeEach(() => {
        const mockDryRunService: DryRunService = {
            run: vi.fn(),
            fullPath: '',
            isZeroYaml: false,
            validation: true,
            runScript: vi.fn()
        };

        instance = new NangoSyncCLI(
            {
                secretKey: 'test-secret-key',
                syncConfig: {
                    models_json_schema: {
                        definitions: {
                            TestModel: {
                                type: 'object',
                                properties: {
                                    id: {
                                        type: 'number'
                                    },
                                    name: {
                                        type: 'string'
                                    }
                                },
                                required: ['id']
                            }
                        }
                    }
                }
            } as any,
            { dryRunService: mockDryRunService }
        );
    });

    describe('batchSave', () => {
        it('should deduplicate records while preserving the last occurrence', () => {
            const model = 'TestModel';
            const results = [
                { id: 1, name: 'Record 1' },
                { id: 2, name: 'Record 2' },
                { id: 1, name: 'Record 1 Updated' },
                { id: 3, name: 'Record 3' }
            ];

            instance.batchSave(results, model);

            const expectedUniqueResults = [
                { id: 2, name: 'Record 2' },
                { id: 1, name: 'Record 1 Updated' },
                { id: 3, name: 'Record 3' }
            ];

            const savedResults = instance.rawSaveOutput.get(instance.modelFullName(model));
            expect(savedResults).toEqual(expectedUniqueResults);
        });

        it('should log a warning when duplicate records are detected', () => {
            const results = [
                { id: 1, name: 'Record 1' },
                { id: 1, name: 'Record 1 Updated' }
            ];

            const model = 'TestModel';

            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            instance.batchSave(results, model);

            expect(consoleWarnSpy).toHaveBeenCalledWith('batchSave detected duplicate records for ID: 1. Keeping the last occurrence.');

            consoleWarnSpy.mockRestore();
        });
    });
});
