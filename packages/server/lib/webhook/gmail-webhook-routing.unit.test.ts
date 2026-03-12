import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as GmailWebhookRouting from './gmail-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

describe('gmailWebhookRouting', () => {
    it('routes by connection_config.emailAddress first', async () => {
        const integration = getTestConfig({ provider: 'google-mail' });

        const mock = vi.fn().mockResolvedValue({ connectionIds: ['conn-1'], connectionMetadata: {} });

        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const payload = { emailAddress: 'user@example.com', historyId: '1' };
        const body = { message: { data: Buffer.from(JSON.stringify(payload)).toString('base64') } };

        await GmailWebhookRouting.default(nangoMock as unknown as InternalNango, {}, body as any, '');

        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                propName: 'emailAddress',
                webhookType: 'type',
                connectionIdentifier: 'emailAddress',
                body: expect.objectContaining({ type: '*', emailAddress: 'user@example.com' })
            })
        );
    });

    it('falls back to metadata.emailAddress then metadata.email', async () => {
        const integration = getTestConfig({ provider: 'google-mail' });

        const mock = vi
            .fn()
            .mockResolvedValueOnce({ connectionIds: [], connectionMetadata: {} })
            .mockResolvedValueOnce({ connectionIds: [], connectionMetadata: {} })
            .mockResolvedValueOnce({ connectionIds: ['conn-2'], connectionMetadata: {} });

        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const payload = { emailAddress: 'user@example.com', historyId: '1' };
        const body = { message: { data: Buffer.from(JSON.stringify(payload)).toString('base64') } };

        await GmailWebhookRouting.default(nangoMock as unknown as InternalNango, {}, body as any, '');

        expect(mock).toHaveBeenCalledTimes(3);
        expect(mock).toHaveBeenNthCalledWith(1, expect.objectContaining({ propName: 'emailAddress' }));
        expect(mock).toHaveBeenNthCalledWith(2, expect.objectContaining({ propName: 'metadata.emailAddress' }));
        expect(mock).toHaveBeenNthCalledWith(3, expect.objectContaining({ propName: 'metadata.email' }));
    });
});
