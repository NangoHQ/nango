import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NangoSyncCLI } from './sdk.js';

describe('NangoSyncCLI - batchSave', () => {
    let instance: NangoSyncCLI;

    beforeEach(() => {
        const mockDryRunService = {
            run: vi.fn(),
            fullPath: '',
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
