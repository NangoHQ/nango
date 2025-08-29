import crypto from 'crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as HubspotWebhookRouting from './hubspot-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { HubSpotWebhook } from './types.js';

vi.mock('crypto', async () => {
    const actualCrypto = (await vi.importActual('crypto')) as any;
    return {
        ...actualCrypto,
        timingSafeEqual: () => true
    };
});

describe('Webhook route unit tests', () => {
    it('Should order the body accordingly based on the contact.creation', async () => {
        const integration = getTestConfig({ provider: 'hubspot', oauth_client_secret: 'abcdef' });

        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const body: HubSpotWebhook[] = [
            {
                eventId: 2409503945,
                subscriptionId: 2426762,
                portalId: 143553137,
                appId: 2633736,
                occurredAt: 1705422467780,
                subscriptionType: 'contact.propertyChange',
                attemptNumber: 0,
                objectId: 1801,
                propertyName: 'email',
                propertyValue: 'nnn@husbpot.com',
                changeSource: 'CRM_UI',
                sourceId: 'userId:51430432'
            },
            {
                eventId: 4023112300,
                subscriptionId: 2426754,
                portalId: 143553137,
                appId: 2633736,
                occurredAt: 1705422467780,
                subscriptionType: 'contact.creation',
                attemptNumber: 0,
                objectId: 1801,
                changeFlag: 'CREATED',
                changeSource: 'CRM_UI',
                sourceId: 'userId:51430432'
            },
            {
                eventId: 4081501134,
                subscriptionId: 2426760,
                portalId: 143553137,
                appId: 2633736,
                occurredAt: 1705422467780,
                subscriptionType: 'contact.propertyChange',
                attemptNumber: 0,
                objectId: 1801,
                propertyName: 'firstname',
                propertyValue: 'nnn',
                changeSource: 'CRM_UI',
                sourceId: 'userId:51430432'
            },
            {
                eventId: 848652288,
                subscriptionId: 2426761,
                portalId: 143553137,
                appId: 2633736,
                occurredAt: 1705422467780,
                subscriptionType: 'contact.propertyChange',
                attemptNumber: 0,
                objectId: 1801,
                propertyName: 'lastname',
                propertyValue: 'nnn',
                changeSource: 'CRM_UI',
                sourceId: 'userId:51430432'
            },
            {
                eventId: 179638925,
                subscriptionId: 2426763,
                portalId: 143553137,
                appId: 2633736,
                occurredAt: 1705422467780,
                subscriptionType: 'contact.propertyChange',
                attemptNumber: 0,
                objectId: 1801,
                propertyName: 'hs_marketable_status',
                propertyValue: 'false',
                changeSource: 'CRM_UI',
                sourceId: 'userId:51430432'
            }
        ];
        const combinedSignature = `${integration.oauth_client_secret}${JSON.stringify(body)}`;
        const createdHash = crypto.createHash('sha256').update(combinedSignature).digest('hex');
        const headers = { 'x-hubspot-signature': createdHash };

        await HubspotWebhookRouting.default(nangoMock as unknown as InternalNango, headers, body, '');

        expect(mock).toHaveBeenCalledTimes(body.length);
        expect(mock).toHaveBeenNthCalledWith(2, {
            body: body[0],
            connectionIdentifier: 'portalId',
            webhookType: 'subscriptionType'
        });
    });

    it('Should order the body accordingly based on the foo.creation', async () => {
        const integration = getTestConfig({ provider: 'hubspot', oauth_client_secret: 'abcdef' });

        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter: logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const body: HubSpotWebhook[] = [
            {
                eventId: 2409503945,
                subscriptionId: 2426762,
                portalId: 143553137,
                appId: 2633736,
                occurredAt: 1705422467780,
                subscriptionType: 'contact.propertyChange',
                attemptNumber: 0,
                objectId: 1801,
                propertyName: 'email',
                propertyValue: 'nnn@husbpot.com',
                changeSource: 'CRM_UI',
                sourceId: 'userId:51430432'
            },
            {
                eventId: 123,
                subscriptionId: 2426754,
                portalId: 143553137,
                appId: 2633736,
                occurredAt: 1705422467780,
                subscriptionType: 'foo.creation',
                attemptNumber: 0,
                objectId: 1801,
                changeFlag: 'CREATED',
                changeSource: 'CRM_UI',
                sourceId: 'userId:51430432'
            },
            {
                eventId: 1234,
                subscriptionId: 2426765,
                portalId: 143553137,
                occurredAt: 1705422467780,
                subscriptionType: 'all.creation',
                attemptNumber: 0,
                objectId: 111
            }
        ];
        const combinedSignature = `${integration.oauth_client_secret}${JSON.stringify(body)}`;
        const createdHash = crypto.createHash('sha256').update(combinedSignature).digest('hex');
        const headers = { 'x-hubspot-signature': createdHash };

        await HubspotWebhookRouting.default(nangoMock as unknown as InternalNango, headers, body, '');

        expect(mock).toHaveBeenCalledTimes(body.length);
        expect(mock).toHaveBeenNthCalledWith(1, {
            body: body[2],
            connectionIdentifier: 'portalId',
            webhookType: 'subscriptionType'
        });
        expect(mock).toHaveBeenNthCalledWith(2, {
            body: body[1],
            connectionIdentifier: 'portalId',
            webhookType: 'subscriptionType'
        });
        expect(mock).toHaveBeenNthCalledWith(3, {
            body: body[0],
            connectionIdentifier: 'portalId',
            webhookType: 'subscriptionType'
        });
    });
});
