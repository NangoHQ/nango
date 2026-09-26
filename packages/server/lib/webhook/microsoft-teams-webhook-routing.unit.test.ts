import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as MicrosoftTeamsWebhookRouting from './microsoft-teams-webhook-routing.js';

import type { BotFrameworkJWK } from './cache.js';
import type { NangoError } from '@nangohq/shared';

const flagMocks = vi.hoisted(() => ({ isMicrosoftTeamsWebhookVerificationEnforced: vi.fn() }));

vi.mock('@nangohq/feature-flags', () => ({
    getFlags: () => ({ isMicrosoftTeamsWebhookVerificationEnforced: flagMocks.isMicrosoftTeamsWebhookVerificationEnforced })
}));

vi.mock('./cache.js', () => ({
    getBotFrameworkJWK: vi.fn()
}));

vi.mock('./missing-secret.js', () => ({
    countUnverifiedWebhook: vi.fn()
}));

const { getBotFrameworkJWK } = await import('./cache.js');
const getBotFrameworkJWKMock = vi.mocked(getBotFrameworkJWK);
const { countUnverifiedWebhook } = await import('./missing-secret.js');
const countUnverifiedWebhookMock = vi.mocked(countUnverifiedWebhook);

const APP_ID = '00000000-0000-0000-0000-000000000001';
const SERVICE_URL = 'https://smba.trafficmanager.net/amer/';
const KID = 'test-kid';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, endorsements: ['msteams'] } as BotFrameworkJWK;

const activity = { type: 'message', channelId: 'msteams', serviceUrl: SERVICE_URL, channelData: { tenant: { id: 'tenant-1' } } };

function sign(claims: Record<string, unknown> = {}, { key = privateKey, kid = KID }: { key?: crypto.KeyObject; kid?: string } = {}) {
    const exp = Math.floor(Date.now() / 1000) + 60 * 60;

    return jwt.sign({ iss: 'https://api.botframework.com', aud: APP_ID, serviceurl: SERVICE_URL, exp, ...claims }, key, { algorithm: 'RS256', keyid: kid });
}

async function route(headers: Record<string, string>, body: unknown = activity) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({ provider: 'microsoft-teams-bot', oauth_client_id: APP_ID }),
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const execute = vi.fn().mockResolvedValue({ connectionIds: ['conn-1'], connectionMetadata: {} });
    nango.executeScriptForWebhooks = execute;

    const result = await MicrosoftTeamsWebhookRouting.default(nango, headers, body as never, JSON.stringify(body));

    return { result, execute, nango };
}

function countedReason() {
    expect(countUnverifiedWebhookMock).toHaveBeenCalledOnce();
    return countUnverifiedWebhookMock.mock.calls[0]?.[0].reason;
}

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

describe('microsoft-teams-webhook-routing', () => {
    beforeEach(() => {
        getBotFrameworkJWKMock.mockReset();
        getBotFrameworkJWKMock.mockImplementation((kid) => Promise.resolve(kid === KID ? jwk : undefined));
        countUnverifiedWebhookMock.mockReset();
        flagMocks.isMicrosoftTeamsWebhookVerificationEnforced.mockReset();
        flagMocks.isMicrosoftTeamsWebhookVerificationEnforced.mockResolvedValue(true);
    });

    it('routes an activity with a valid Bot Framework token', async () => {
        const { result, execute, nango } = await route({ authorization: `Bearer ${sign()}` });

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ connectionIdentifier: 'channelData.tenant.id', propName: 'tenantId' }));
        expect(nango.unverified).toBeUndefined();
        expect(countUnverifiedWebhookMock).not.toHaveBeenCalled();
    });

    it('rejects a missing authorization header', async () => {
        const { result, execute } = await route({});

        expect(errType(result)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
        expect(countedReason()).toBe('microsoft_teams_missing_authorization');
    });

    it.each([
        ['a non bearer scheme', () => `Basic ${sign()}`],
        ['a malformed token', () => 'Bearer not-a-jwt'],
        ['a token signed with another key', () => `Bearer ${sign({}, { key: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey })}`],
        ['an unknown kid', () => `Bearer ${sign({}, { kid: 'other-kid' })}`],
        ['an expired token', () => `Bearer ${sign({ exp: Math.floor(Date.now() / 1000) - 10 * 60 })}`],
        ['a token for another service url', () => `Bearer ${sign({ serviceurl: 'https://attacker.example.com/' })}`]
    ])('rejects %s', async (_name, authorization) => {
        const { result, execute } = await route({ authorization: authorization() });

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
        expect(countedReason()).toBe('microsoft_teams_invalid_token');
    });

    it('rejects a token from another issuer before looking up its key', async () => {
        const { result } = await route({ authorization: `Bearer ${sign({ iss: 'https://sts.windows.net/tenant/' })}` });

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(countedReason()).toBe('microsoft_teams_unexpected_issuer');
        expect(getBotFrameworkJWKMock).not.toHaveBeenCalled();
    });

    it('accepts a token expired within the clock tolerance', async () => {
        const { result } = await route({ authorization: `Bearer ${sign({ exp: Math.floor(Date.now() / 1000) - 60 })}` });

        expect(result.isOk()).toBe(true);
        expect(countUnverifiedWebhookMock).not.toHaveBeenCalled();
    });

    it.each([
        ['another channel', { ...activity, channelId: 'slack' }],
        ['no channel', { type: activity.type, serviceUrl: activity.serviceUrl, channelData: activity.channelData }]
    ])('rejects an endorsed key used for an activity from %s', async (_name, body) => {
        const { result } = await route({ authorization: `Bearer ${sign()}` }, body);

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(countedReason()).toBe('microsoft_teams_invalid_token');
    });

    it('rejects a token for another bot as an audience mismatch', async () => {
        const { result, execute } = await route({ authorization: `Bearer ${sign({ aud: 'other-app-id' })}` });

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
        expect(countedReason()).toBe('microsoft_teams_audience_mismatch');
    });

    it('rejects a body without a service url', async () => {
        const { result } = await route(
            { authorization: `Bearer ${sign()}` },
            { type: activity.type, channelId: activity.channelId, channelData: activity.channelData }
        );

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(countedReason()).toBe('microsoft_teams_invalid_token');
    });

    it('treats a key set fetch failure as an invalid token', async () => {
        getBotFrameworkJWKMock.mockRejectedValue(new Error('network down'));
        const { result } = await route({ authorization: `Bearer ${sign()}` });

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(countedReason()).toBe('microsoft_teams_invalid_token');
    });

    it('counts and still routes unverified activities while enforcement is off', async () => {
        flagMocks.isMicrosoftTeamsWebhookVerificationEnforced.mockResolvedValue(false);
        const { result, execute, nango } = await route({ authorization: `Bearer ${sign({ aud: 'other-app-id' })}` });

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(countedReason()).toBe('microsoft_teams_audience_mismatch');
        expect(nango.unverified?.reason).toBe('microsoft_teams_audience_mismatch');
    });
});
