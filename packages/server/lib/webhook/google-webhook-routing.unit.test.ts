import crypto from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { environmentService, getGlobalWebhookReceiveUrl, seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as GoogleWebhookRouting from './google-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { IntegrationConfig } from '@nangohq/types';

const flagMocks = vi.hoisted(() => ({ allowUnauthorizedGmailWebhook: vi.fn() }));

vi.mock('@nangohq/feature-flags', () => ({
    getFlags: () => ({ allowUnauthorizedGmailWebhook: flagMocks.allowUnauthorizedGmailWebhook })
}));

vi.mock('./cache.js', () => ({
    getGoogleJWKS: vi.fn()
}));

const { getGoogleJWKS } = await import('./cache.js');
const getGoogleJWKSMock = vi.mocked(getGoogleJWKS);

function gmailPubSubBody(emailAddress = 'user@example.com') {
    const data = Buffer.from(JSON.stringify({ emailAddress, historyId: '1' })).toString('base64');
    return { message: { data, messageId: '1' }, subscription: 'projects/p/subscriptions/s' };
}

const SECRET = 'pubsub-secret-0123456789';

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
            request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
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
            request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
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
            request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
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

    it('rejects a missing channel token when a webhook secret is configured', async () => {
        const integration = getTestConfig({ provider: 'google', custom: { webhookSecret: 'channel-secret' } });
        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const result = await GoogleWebhookRouting.default(
            nangoMock as unknown as InternalNango,
            { 'x-goog-resource-uri': EXAMPLE_RESOURCE_URI } as any,
            {},
            ''
        );

        expect(result.isErr()).toBe(true);
        expect(mock).not.toHaveBeenCalled();
    });

    it('rejects a mismatched channel token when a webhook secret is configured', async () => {
        const integration = getTestConfig({ provider: 'google', custom: { webhookSecret: 'channel-secret' } });
        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const result = await GoogleWebhookRouting.default(
            nangoMock as unknown as InternalNango,
            {
                'x-goog-resource-uri': EXAMPLE_RESOURCE_URI,
                'x-goog-channel-token': 'wrong'
            } as any,
            {},
            ''
        );

        expect(result.isErr()).toBe(true);
        expect(mock).not.toHaveBeenCalled();
    });

    it('routes when the channel token matches the webhook secret', async () => {
        const integration = getTestConfig({ provider: 'google', custom: { webhookSecret: 'channel-secret' } });
        const mock = vi.fn().mockResolvedValueOnce({ connectionIds: ['conn-1'], connectionMetadata: {} });
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const result = await GoogleWebhookRouting.default(
            nangoMock as unknown as InternalNango,
            {
                'x-goog-resource-uri': EXAMPLE_RESOURCE_URI,
                'x-goog-channel-token': 'channel-secret',
                'x-goog-resource-state': 'exists'
            } as any,
            {},
            ''
        );

        expect(result.isOk()).toBe(true);
        expect(mock).toHaveBeenCalledTimes(1);
    });

    describe('gmail pub/sub pushes', () => {
        const environment = seeders.getTestEnvironment();

        beforeEach(() => {
            vi.restoreAllMocks();
            getGoogleJWKSMock.mockReset();
            flagMocks.allowUnauthorizedGmailWebhook.mockReset();
            flagMocks.allowUnauthorizedGmailWebhook.mockResolvedValue(false);
            vi.spyOn(environmentService, 'getById').mockResolvedValue(environment);
        });

        function getNango(integration: IntegrationConfig) {
            const nango = new InternalNango({
                team: seeders.getTestTeam(),
                environment,
                plan: seeders.getTestPlan(),
                integration,
                request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
                logContextGetter
            });
            const execute = vi.fn().mockResolvedValue({ connectionIds: ['conn-1'], connectionMetadata: {} });
            nango.executeScriptForWebhooks = execute;
            return { nango, execute };
        }

        // A JWT signed by a key Google's JWKS (mocked) vouches for, for this integration's webhook URL.
        function signedAuthorization(integration: IntegrationConfig): Record<string, string> {
            const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
            const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-kid' })).toString('base64url');
            const aud = `${getGlobalWebhookReceiveUrl()}/${environment.uuid}/${encodeURIComponent(integration.unique_key)}`;
            const payload = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud, exp: Math.floor(Date.now() / 1000) + 3600 })).toString(
                'base64url'
            );
            const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
            getGoogleJWKSMock.mockResolvedValue([{ ...publicKey.export({ format: 'jwk' }), kid: 'test-kid' } as Record<string, string>]);
            return { authorization: `Bearer ${header}.${payload}.${signature}` };
        }

        const withSecret = (overrides: Partial<IntegrationConfig> = {}) =>
            getTestConfig({ provider: 'google', custom: { webhookSecret: SECRET }, ...overrides });

        it('routes a signed push with the secret in the query by email, not by calendar resource URI', async () => {
            const integration = withSecret();
            const { nango, execute } = getNango(integration);
            const markUnverified = vi.spyOn(nango, 'markUnverified');
            const body = gmailPubSubBody();

            const result = await GoogleWebhookRouting.default(nango, signedAuthorization(integration), body, '', { nangoWebhookSecret: SECRET });

            expect(result.isOk()).toBe(true);
            expect(result.unwrap()).toMatchObject({ connectionIds: ['conn-1'], toForward: body });
            expect(execute).toHaveBeenCalledWith(expect.objectContaining({ webhookType: 'type', propName: 'emailAddressHash' }));
            expect(execute.mock.calls[0]?.[0]).toMatchObject({ payload: { type: '*', emailAddress: 'user@example.com' } });
            expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({ propName: 'metadata.googleCalendarWatchResourceUris' }));
            expect(markUnverified).not.toHaveBeenCalled();
        });

        it('routes a signed push with the secret in the header', async () => {
            const integration = withSecret();
            const { nango, execute } = getNango(integration);

            const result = await GoogleWebhookRouting.default(
                nango,
                { ...signedAuthorization(integration), 'x-nango-webhook-secret': SECRET },
                gmailPubSubBody(),
                '',
                {}
            );

            expect(result.isOk()).toBe(true);
            expect(execute).toHaveBeenCalled();
        });

        describe('rejects, even when unverified webhooks are allowed and the legacy Gmail flag is on', () => {
            beforeEach(() => {
                flagMocks.allowUnauthorizedGmailWebhook.mockResolvedValue(true);
            });

            const cases: { name: string; integration: () => IntegrationConfig; query: Record<string, string>; signed: boolean }[] = [
                {
                    name: 'when the integration has no webhook secret',
                    integration: () => getTestConfig({ provider: 'google', allow_unverified_webhooks: true }),
                    query: {},
                    signed: true
                },
                {
                    name: 'when the secret is shorter than 16 characters',
                    integration: () => getTestConfig({ provider: 'google', allow_unverified_webhooks: true, custom: { webhookSecret: 'short-secret' } }),
                    query: { nangoWebhookSecret: 'short-secret' },
                    signed: true
                },
                { name: 'a push without the secret', integration: () => withSecret({ allow_unverified_webhooks: true }), query: {}, signed: true },
                {
                    name: 'a push with the wrong secret',
                    integration: () => withSecret({ allow_unverified_webhooks: true }),
                    query: { nangoWebhookSecret: 'wrong' },
                    signed: true
                },
                {
                    name: 'an unsigned push with the right secret',
                    integration: () => withSecret({ allow_unverified_webhooks: true }),
                    query: { nangoWebhookSecret: SECRET },
                    signed: false
                }
            ];

            for (const { name, integration: makeIntegration, query, signed } of cases) {
                it(name, async () => {
                    const integration = makeIntegration();
                    const { nango, execute } = getNango(integration);
                    const headers = signed ? signedAuthorization(integration) : {};

                    const result = await GoogleWebhookRouting.default(nango, headers, gmailPubSubBody(), '', query);

                    expect(result.isErr()).toBe(true);
                    expect(execute).not.toHaveBeenCalled();
                });
            }
        });

        it('does not accept the calendar channel token header in place of the secret', async () => {
            const integration = withSecret();
            const { nango, execute } = getNango(integration);

            const result = await GoogleWebhookRouting.default(
                nango,
                { ...signedAuthorization(integration), 'x-goog-channel-token': SECRET },
                gmailPubSubBody(),
                '',
                {}
            );

            expect(result.isErr()).toBe(true);
            expect(execute).not.toHaveBeenCalled();
        });

        it('rejects a push with the right secret but an invalid JWT', async () => {
            const { nango, execute } = getNango(withSecret());

            const result = await GoogleWebhookRouting.default(nango, { authorization: 'Bearer not-a-jwt' }, gmailPubSubBody(), '', {
                nangoWebhookSecret: SECRET
            });

            expect(result.isErr()).toBe(true);
            expect(execute).not.toHaveBeenCalled();
        });

        it('still treats an empty body with calendar headers as a calendar push', async () => {
            const { nango, execute } = getNango(getTestConfig({ provider: 'google' }));

            await GoogleWebhookRouting.default(nango, { 'x-goog-resource-uri': EXAMPLE_RESOURCE_URI, 'x-goog-resource-state': 'exists' }, {}, '');

            expect(execute).toHaveBeenCalledTimes(1);
            expect(execute).toHaveBeenCalledWith(expect.objectContaining({ propName: 'metadata.googleCalendarWatchResourceUris' }));
        });
    });
});
