import { expect, describe, it } from 'vitest';
import integrationService from './integration.service.js';
import { mockCreateActivityLogMessage } from '../../activity/mocks.js';
import path from 'path';

const loadLocation = path.join(__dirname, 'mocks/nango-integrations');

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

    it('Runs a simple integration script that returns an expected object', async () => {
        mockCreateActivityLogMessage();
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

    it('Runs a simple integration script that returns an expected object with a Nango class', async () => {
        mockCreateActivityLogMessage();

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

    /*
    it('Runs a importer integration script that returns an expected object', async () => {
        process.env['NANGO_INTEGRATIONS_FULL_PATH'] = path.join(__dirname, 'mocks/nango-integrations/dist');

        mockCreateActivityLogMessage();
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

        const result = await integrationService.runScript('importer', 1, mockNango, {} as any, 1, false, false, loadLocation);
        expect(result).toEqual(mockNango.post());
    });
    */

    it('Runs an action with an argument that returns the argument', async () => {
        mockCreateActivityLogMessage();
        const param = { test: 'test' };
        const mockNango: any = {
            get: () => {
                return null;
            }
        };

        const result = await integrationService.runScript('action', 1, mockNango, {} as any, 1, false, true, loadLocation, param);
        expect(result).toEqual(param);
    });

    it('Runs a sync with an internal node.js dependency', async () => {
        mockCreateActivityLogMessage();

        const nangoClass = class Nango {
            public get() {
                return {
                    data: {
                        classTest: {
                            id: 'dep'
                        }
                    }
                };
            }
        };
        const nango = new nangoClass();

        const result = await integrationService.runScript('dependency', 1, nango as any, {} as any, 1, false, true, loadLocation);
        expect(result).toEqual(nango.get());
    });
});
