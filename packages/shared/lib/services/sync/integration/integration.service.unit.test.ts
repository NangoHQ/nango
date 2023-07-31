import { expect, describe, it } from 'vitest';
import integrationService from './integration.service.js';
import { mockCreateActivityLogMessage } from '../../activity/mocks.js';

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
            'test'
        );
        expect(result).toEqual(null);
    });

    it('Should run a simple integration script', async () => {
        mockCreateActivityLogMessage();
        const result = await integrationService.run('add-bundle');
        expect(result).toEqual(15);
    });

    it('Should run a simple integration script', async () => {
        mockCreateActivityLogMessage();
        const result = await integrationService.run('github-issues-bundle');
        console.log(result);
    });
});
