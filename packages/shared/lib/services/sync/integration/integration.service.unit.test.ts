import { expect, describe, it } from 'vitest';
import integrationService from './integration.service.js';
import { mockCreateActivityLogMessage } from '../../activity/mocks.js';
import path from 'path';

describe('Should run an integration script', () => {
    it('Returns null if the proper arguments are not passed', async () => {
        mockCreateActivityLogMessage();
        const result = await integrationService.runScript(
            'test-sync',
            1,
            // @ts-ignore
            {},
            {},
            1,
            false,
            false,
            'test'
        );
        expect(result).toEqual(null);
    });

    it('Runs a simple javascript function that returns an expected object', async () => {
        mockCreateActivityLogMessage();
        const loadLocation = path.join(__dirname, '.');
        const mockNango: any = {
            get: () => {
                return {
                    data: {
                        sync: {
                            id: 'get'
                        }
                    }
                };
            }
        };

        const result = await integrationService.runScript('simple', 1, mockNango, {} as any, 1, false, false, loadLocation);
        expect(result).toEqual(mockNango.get());
    });

    it('Runs a simple javascript function that returns an expected object with a Nango class', async () => {
        mockCreateActivityLogMessage();
        const loadLocation = path.join(__dirname, '.');

        const nangoClass = class Nango {
            public get() {
                return {
                    data: {
                        classTest: {
                            id: 'get'
                        }
                    }
                };
            }
        };
        const nango = new nangoClass();

        const result = await integrationService.runScript('simple', 1, nango as any, {} as any, 1, false, false, loadLocation);
        expect(result).toEqual(nango.get());
    });

    it('Runs a compiled javascript function that returns an expected object', async () => {
        mockCreateActivityLogMessage();
        const loadLocation = path.join(__dirname, '.');
        const mockNango: any = {
            post: () => {
                return {
                    data: {
                        sync: {
                            id: 'post'
                        }
                    }
                };
            }
        };

        const result = await integrationService.runScript('compiled', 1, mockNango, {} as any, 1, false, false, loadLocation);
        expect(result).toEqual(mockNango.post());
    });

    it('Runs an action with an argument that returns the argument', async () => {
        mockCreateActivityLogMessage();
        const loadLocation = path.join(__dirname, '.');
        const param = { test: 'test' };
        const mockNango: any = {
            get: () => {
                return null;
            }
        };

        const result = await integrationService.runScript('action', 1, mockNango, {} as any, 1, false, true, loadLocation, param);
        expect(result).toEqual(param);
    });
});
