import crypto from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { environmentService, getGlobalWebhookReceiveUrl, NangoError, seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { hashEmailAddress } from '../utils/pii.js';
import * as GmailWebhookRouting from './gmail-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { IntegrationConfig } from '@nangohq/types';

vi.mock('./cache.js', () => ({
    getGoogleJWKS: vi.fn()
}));

const { getGoogleJWKS } = await import('./cache.js');
const getGoogleJWKSMock = vi.mocked(getGoogleJWKS);

const environment = seeders.getTestEnvironment();

function gmailBody() {
    const payload = { emailAddress: 'user@example.com', historyId: '1' };
    return { message: { data: Buffer.from(JSON.stringify(payload)).toString('base64') } };
}

function createSignedJwt({
    integration,
    iss = 'https://accounts.google.com',
    exp = Math.floor(Date.now() / 1000) + 3600,
    aud
}: {
    integration: IntegrationConfig;
    iss?: string;
    exp?: number;
    aud?: string;
}) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = 'test-kid';
    const header = { alg: 'RS256', typ: 'JWT', kid };
    const expectedAud = `${getGlobalWebhookReceiveUrl()}/${environment.uuid}/${integration.unique_key}`;
    const payload = { iss, aud: aud ?? expectedAud, exp };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signedData = `${headerB64}.${payloadB64}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(signedData), privateKey);

    return {
        token: `${signedData}.${signature.toString('base64url')}`,
        jwk: { ...publicKey.export({ format: 'jwk' }), kid }
    };
}

function getNangoMock(integration: IntegrationConfig) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment,
        plan: seeders.getTestPlan(),
        integration,
        logContextGetter
    });
    const execute = vi.fn().mockResolvedValue({ connectionIds: ['conn-1'], connectionMetadata: {} });
    nango.executeScriptForWebhooks = execute;
    return { nango, execute };
}

describe('gmailWebhookRouting', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        getGoogleJWKSMock.mockReset();
        vi.spyOn(environmentService, 'getById').mockResolvedValue(environment);
    });

    it('routes by connection_config.emailAddressHash first', async () => {
        const integration = getTestConfig({ provider: 'google-mail', unique_key: 'google-mail' });
        const { token, jwk } = createSignedJwt({ integration });
        getGoogleJWKSMock.mockResolvedValue([jwk as Record<string, string>]);

        const { nango, execute } = getNangoMock(integration);
        const body = gmailBody();

        await GmailWebhookRouting.default(nango, { authorization: `Bearer ${token}` }, body as any, '');

        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                propName: 'emailAddressHash',
                webhookType: 'type',
                connectionIdentifier: 'emailAddressHash',
                body: expect.objectContaining({
                    type: '*',
                    emailAddress: 'user@example.com',
                    emailAddressHash: hashEmailAddress('user@example.com')
                })
            })
        );
    });

    it('falls back to legacy config then metadata', async () => {
        const integration = getTestConfig({ provider: 'google-mail', unique_key: 'google-mail' });
        const { token, jwk } = createSignedJwt({ integration });
        getGoogleJWKSMock.mockResolvedValue([jwk as Record<string, string>]);

        const execute = vi
            .fn()
            .mockResolvedValueOnce({ connectionIds: [], connectionMetadata: {} })
            .mockResolvedValueOnce({ connectionIds: [], connectionMetadata: {} })
            .mockResolvedValueOnce({ connectionIds: [], connectionMetadata: {} })
            .mockResolvedValueOnce({ connectionIds: ['conn-2'], connectionMetadata: {} });

        const nango = new InternalNango({
            team: seeders.getTestTeam(),
            environment,
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nango.executeScriptForWebhooks = execute;

        await GmailWebhookRouting.default(nango, { authorization: `Bearer ${token}` }, gmailBody() as any, '');

        expect(execute).toHaveBeenCalledTimes(3);
        expect(execute).toHaveBeenNthCalledWith(1, expect.objectContaining({ propName: 'emailAddressHash' }));
        expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ propName: 'metadata.emailAddress' }));
        expect(execute).toHaveBeenNthCalledWith(3, expect.objectContaining({ propName: 'metadata.email' }));
    });

    it('rejects a request with no Authorization header', async () => {
        const integration = getTestConfig({ provider: 'google-mail', unique_key: 'google-mail' });
        const { nango, execute } = getNangoMock(integration);

        const result = await GmailWebhookRouting.default(nango, {}, gmailBody() as any, '');

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(NangoError);
            expect((result.error as NangoError).type).toBe('webhook_missing_signature');
        }
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an invalid JWT', async () => {
        const integration = getTestConfig({ provider: 'google-mail', unique_key: 'google-mail' });
        const { nango, execute } = getNangoMock(integration);

        const result = await GmailWebhookRouting.default(nango, { authorization: 'Bearer not-a-jwt' }, gmailBody() as any, '');

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(NangoError);
            expect((result.error as NangoError).type).toBe('webhook_invalid_signature');
        }
        expect(execute).not.toHaveBeenCalled();
    });

    it('accepts a valid Google JWT and routes the webhook', async () => {
        const integration = getTestConfig({ provider: 'google-mail', unique_key: 'gmail-prod' });
        const { token, jwk } = createSignedJwt({ integration });
        getGoogleJWKSMock.mockResolvedValue([jwk as Record<string, string>]);

        const { nango, execute } = getNangoMock(integration);
        const result = await GmailWebhookRouting.default(nango, { authorization: `Bearer ${token}` }, gmailBody() as any, '');

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('rejects a JWT whose audience uses provider instead of unique_key', async () => {
        const integration = getTestConfig({ provider: 'google-mail', unique_key: 'gmail-prod' });
        const { token, jwk } = createSignedJwt({
            integration,
            aud: `${getGlobalWebhookReceiveUrl()}/${environment.uuid}/${integration.provider}`
        });
        getGoogleJWKSMock.mockResolvedValue([jwk as Record<string, string>]);

        const { nango, execute } = getNangoMock(integration);
        const result = await GmailWebhookRouting.default(nango, { authorization: `Bearer ${token}` }, gmailBody() as any, '');

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });
});
