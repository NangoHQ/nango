import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as GoogleCalendarWebhookRouting from './google-calendar-webhook-routing.js';
import { InternalNango } from './internal-nango.js';
import { hashEmailAddress } from '../utils/pii.js';

const EXAMPLE_RESOURCE_URI = 'https://www.googleapis.com/calendar/v3/calendars/user%40example.com/events?alt=json';

describe('googleCalendarWebhookRouting', () => {
    it('tries metadata.googleCalendarWatchResourceUris first (raw X-Goog-Resource-URI), then legacy chain', async () => {
        const integration = getTestConfig({ provider: 'google-calendar' });

        const mock = vi
            .fn()
            .mockResolvedValueOnce({ connectionIds: [], connectionMetadata: {} })
            .mockResolvedValueOnce({ connectionIds: [], connectionMetadata: {} })
            .mockResolvedValueOnce({ connectionIds: [], connectionMetadata: {} })
            .mockResolvedValueOnce({ connectionIds: ['conn-1'], connectionMetadata: {} });

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
            'x-goog-resource-state': 'exists'
        };

        await GoogleCalendarWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, {}, '');

        expect(mock).toHaveBeenCalledTimes(4);
        expect(mock).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                propName: 'metadata.googleCalendarWatchResourceUris',
                connectionIdentifierValue: EXAMPLE_RESOURCE_URI
            })
        );
        expect(mock).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                propName: 'emailAddressHash',
                connectionIdentifier: 'emailAddressHash',
                connectionIdentifierValue: hashEmailAddress('user@example.com')
            })
        );
        expect(mock).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                propName: 'metadata.emailAddress',
                connectionIdentifier: 'emailAddress',
                connectionIdentifierValue: 'user@example.com'
            })
        );
        expect(mock).toHaveBeenNthCalledWith(
            4,
            expect.objectContaining({
                propName: 'metadata.email',
                connectionIdentifier: 'emailAddress',
                connectionIdentifierValue: 'user@example.com'
            })
        );
    });

    it('stops after metadata match when googleCalendarWatchResourceUris matches', async () => {
        const integration = getTestConfig({ provider: 'google-calendar' });

        const mock = vi.fn().mockResolvedValueOnce({ connectionIds: ['conn-meta'], connectionMetadata: {} });

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
            'x-goog-resource-state': 'exists'
        };

        await GoogleCalendarWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, {}, '');

        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                propName: 'metadata.googleCalendarWatchResourceUris',
                connectionIdentifierValue: headers['x-goog-resource-uri']
            })
        );
    });

    it('returns no connection ids and performs no lookups when x-goog-resource-uri is missing', async () => {
        const integration = getTestConfig({ provider: 'google-calendar' });

        const mock = vi.fn();

        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const headers = { 'x-goog-resource-state': 'exists' };

        const result = await GoogleCalendarWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, {}, '');

        expect(result.isOk()).toBe(true);
        if (result.isOk() && 'connectionIds' in result.value) {
            expect(result.value.connectionIds).toEqual([]);
            expect(result.value.statusCode).toBe(200);
        }
        expect(mock).not.toHaveBeenCalled();
    });
});
