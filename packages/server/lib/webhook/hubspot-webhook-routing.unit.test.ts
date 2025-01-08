import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import * as HubspotWebhookRouting from './hubspot-webhook-routing.js';
import type { InternalNango as Nango } from './internal-nango.js';
import type { Config as ProviderConfig } from '@nangohq/shared';
import { logContextGetter } from '@nangohq/logs';

vi.mock('crypto', async () => {
    const actualCrypto = (await vi.importActual('crypto')) as any;
    return {
        ...actualCrypto,
        timingSafeEqual: () => true
    };
});

describe('Webhook route unit tests', () => {
    it('Should order the body accordingly based on the contact.creation', async () => {
        const nangoMock = {
            executeScriptForWebhooks: vi.fn()
        };
        const body = [
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
        const integration = {
            oauth_client_secret: 'abcdef'
        };
        const combinedSignature = `${integration.oauth_client_secret}${JSON.stringify(body)}`;
        const createdHash = crypto.createHash('sha256').update(combinedSignature).digest('hex');
        const headers = { 'x-hubspot-signature': createdHash };

        await HubspotWebhookRouting.default(nangoMock as unknown as Nango, integration as ProviderConfig, headers, body, body.toString(), logContextGetter);

        expect(nangoMock.executeScriptForWebhooks).toHaveBeenCalledTimes(body.length);

        const firstCallFirstArgument = nangoMock.executeScriptForWebhooks.mock.calls[0]?.[1];
        expect(firstCallFirstArgument.eventId).toBe(4023112300);
    });

    it('Should order the body accordingly based on the foo.creation', async () => {
        const nangoMock = {
            executeScriptForWebhooks: vi.fn()
        };
        const body = [
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
                subscriptionType: 'all.creation',
                objectId: 111,
                eventId: 1234
            }
        ];
        const integration = {
            oauth_client_secret: 'abcdef'
        };
        const combinedSignature = `${integration.oauth_client_secret}${JSON.stringify(body)}`;
        const createdHash = crypto.createHash('sha256').update(combinedSignature).digest('hex');
        const headers = { 'x-hubspot-signature': createdHash };

        await HubspotWebhookRouting.default(nangoMock as unknown as Nango, integration as ProviderConfig, headers, body, body.toString(), logContextGetter);

        expect(nangoMock.executeScriptForWebhooks).toHaveBeenCalledTimes(body.length);

        const firstCallFirstArgument = nangoMock.executeScriptForWebhooks.mock.calls[0]?.[1];
        expect(firstCallFirstArgument.eventId).toBe(1234);
        const secondCallFirstArgument = nangoMock.executeScriptForWebhooks.mock.calls[1]?.[1];
        expect(secondCallFirstArgument.eventId).toBe(123);
    });
});
