import { expect, describe, it } from 'vitest';
import * as DataService from './data.service.js';
import type { DataRecord } from '../../../models/Sync.js';
import { mockCreateActivityLogMessage } from '../../activity/mocks.js';
import { LogContext } from '@nangohq/logs';

describe('Data service tests', () => {
    it('Should remove multiple duplicates using the removeDuplicateKey function', async () => {
        mockCreateActivityLogMessage();
        const duplicateRecords = [
            {
                external_id: '1',
                name: 'John Doe'
            },
            {
                external_id: '1',
                name: 'John Doe'
            },
            {
                external_id: '2',
                name: 'Jane Doe'
            },
            {
                external_id: '2',
                name: 'Jane Doe'
            },
            {
                external_id: '3',
                name: 'John Doe'
            },
            {
                external_id: '3',
                name: 'John Doe'
            },
            { external_id: '4', name: 'Mike Doe' },
            { external_id: '5', name: 'Mike Doe' }
        ];
        const activityLogId = 1;
        const model = 'test';
        const expected = [
            {
                external_id: '1',
                name: 'John Doe'
            },
            {
                external_id: '2',
                name: 'Jane Doe'
            },
            {
                external_id: '3',
                name: 'John Doe'
            },
            { external_id: '4', name: 'Mike Doe' },
            { external_id: '5', name: 'Mike Doe' }
        ];

        const logCtx = new LogContext({ parentId: String(activityLogId) }, { dryRun: true, logToConsole: false });
        const actual = await DataService.removeDuplicateKey(duplicateRecords as unknown as DataRecord[], activityLogId, 1, model, logCtx);

        expect(actual).toEqual(expected);
    });
});
