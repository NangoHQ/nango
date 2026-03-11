import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as GoogleCalendarWebhookRouting from './google-calendar-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

describe('googleCalendarWebhookRouting', () => {
    it('routes by connection_config.emailAddress first and falls back to metadata', async () => {
        const integration = getTestConfig({ provider: 'google-calendar' });

        const mock = vi
            .fn()
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
            'x-goog-resource-uri': 'https://www.googleapis.com/calendar/v3/calendars/user%40example.com/events?alt=json',
            'x-goog-resource-state': 'exists'
        };

        await GoogleCalendarWebhookRouting.default(nangoMock as unknown as InternalNango, headers as any, {}, '');

        expect(mock).toHaveBeenCalledTimes(2);
        expect(mock).toHaveBeenNthCalledWith(1, expect.objectContaining({ propName: 'emailAddress', connectionIdentifierValue: 'user@example.com' }));
        expect(mock).toHaveBeenNthCalledWith(2, expect.objectContaining({ propName: 'metadata.emailAddress', connectionIdentifierValue: 'user@example.com' }));
    });
});
