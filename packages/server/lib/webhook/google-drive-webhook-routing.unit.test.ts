import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as GoogleDriveWebhookRouting from './google-drive-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

const EXAMPLE_RESOURCE_ID = 'ret08u3rv24htgh289g';
const EXAMPLE_RESOURCE_URI = 'https://www.googleapis.com/drive/v3/changes';

describe('googleDriveWebhookRouting', () => {
    it('matches metadata.googleDriveWatchResourceIds via x-goog-resource-id', async () => {
        const integration = getTestConfig({ provider: 'google-drive' });

        const mock = vi.fn().mockResolvedValueOnce({ connectionIds: ['conn-1'], connectionMetadata: {} });

        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const headers = {
            'x-goog-resource-uri': EXAMPLE_RESOURCE_URI,
            'x-goog-resource-id': EXAMPLE_RESOURCE_ID,
            'x-goog-resource-state': 'change'
        };

        const result = await GoogleDriveWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, {}, '');

        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                propName: 'metadata.googleDriveWatchResourceIds',
                connectionIdentifierValue: EXAMPLE_RESOURCE_ID,
                webhookTypeValue: 'change'
            })
        );
        expect(result.isOk()).toBe(true);
        if (result.isOk() && 'connectionIds' in result.value) {
            expect(result.value.connectionIds).toEqual(['conn-1']);
        }
    });

    it('falls back to the legacy resourceUri match when no resourceIds match is found', async () => {
        const integration = getTestConfig({ provider: 'google-drive' });

        const mock = vi
            .fn()
            .mockResolvedValueOnce({ connectionIds: [], connectionMetadata: {} }) // resourceIds lookup misses
            .mockResolvedValueOnce({ connectionIds: ['conn-legacy'], connectionMetadata: {} }); // googleWebhookRouting hits

        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const headers = {
            'x-goog-resource-uri': EXAMPLE_RESOURCE_URI,
            'x-goog-resource-id': EXAMPLE_RESOURCE_ID,
            'x-goog-resource-state': 'change'
        };

        const result = await GoogleDriveWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, {}, '');

        expect(mock).toHaveBeenCalledTimes(2);
        expect(mock).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                propName: 'metadata.googleDriveWatchResourceIds',
                connectionIdentifierValue: EXAMPLE_RESOURCE_ID
            })
        );
        expect(mock).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                propName: 'metadata.googleCalendarWatchResourceUris',
                connectionIdentifierValue: EXAMPLE_RESOURCE_URI
            })
        );
        expect(result.isOk()).toBe(true);
        if (result.isOk() && 'connectionIds' in result.value) {
            expect(result.value.connectionIds).toEqual(['conn-legacy']);
        }
    });

    it('falls back to the legacy resourceUri match when x-goog-resource-id is missing', async () => {
        const integration = getTestConfig({ provider: 'google-drive' });

        const mock = vi.fn().mockResolvedValueOnce({ connectionIds: [], connectionMetadata: {} });

        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const headers = { 'x-goog-resource-uri': EXAMPLE_RESOURCE_URI, 'x-goog-resource-state': 'change' };

        await GoogleDriveWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, {}, '');

        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                propName: 'metadata.googleCalendarWatchResourceUris',
                connectionIdentifierValue: EXAMPLE_RESOURCE_URI
            })
        );
    });

    it('returns no connection ids when neither resourceId nor resourceUri are present', async () => {
        const integration = getTestConfig({ provider: 'google-drive' });

        const mock = vi.fn();

        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const headers = { 'x-goog-resource-state': 'sync' };

        const result = await GoogleDriveWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, {}, '');

        expect(result.isOk()).toBe(true);
        if (result.isOk() && 'connectionIds' in result.value) {
            expect(result.value.connectionIds).toEqual([]);
            expect(result.value.statusCode).toBe(200);
        }
        expect(mock).not.toHaveBeenCalled();
    });
});
