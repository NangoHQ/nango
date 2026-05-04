import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as GoogleWebhookRouting from './google-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

const EXAMPLE_RESOURCE_URI = 'https://www.googleapis.com/calendar/v3/calendars/abc123opaque/events?alt=json';

describe('googleWebhookRouting', () => {
    it('uses a single metadata.googleCalendarWatchResourceUris lookup with raw X-Goog-Resource-URI', async () => {
        const integration = getTestConfig({ provider: 'google' });

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
            'x-goog-resource-state': 'exists'
        };

        await GoogleWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, {}, '');

        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                propName: 'metadata.googleCalendarWatchResourceUris',
                connectionIdentifierValue: EXAMPLE_RESOURCE_URI
            })
        );
        expect(mock).not.toHaveBeenCalledWith(expect.objectContaining({ propName: 'emailAddressHash' }));
    });

    it('does not call executeScriptForWebhooks when x-goog-resource-uri is missing', async () => {
        const integration = getTestConfig({ provider: 'google' });

        const mock = vi.fn();

        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        await GoogleWebhookRouting.default(nangoMock as unknown as InternalNango, { 'x-goog-resource-state': 'exists' } as any, {}, '');
        expect(mock).not.toHaveBeenCalled();
    });

    it('looks up metadata using the header value as-is (even if not a valid URL)', async () => {
        const integration = getTestConfig({ provider: 'google' });

        const mock = vi.fn().mockResolvedValueOnce({ connectionIds: [], connectionMetadata: {} });

        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        await GoogleWebhookRouting.default(
            nangoMock as unknown as InternalNango,
            { 'x-goog-resource-uri': 'not-a-url', 'x-goog-resource-state': 'exists' } as any,
            {},
            ''
        );

        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                connectionIdentifierValue: 'not-a-url',
                propName: 'metadata.googleCalendarWatchResourceUris'
            })
        );
    });
});
