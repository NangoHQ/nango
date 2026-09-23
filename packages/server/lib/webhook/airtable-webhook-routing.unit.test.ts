import crypto from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { connectionService, seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as AirtableWebhookRouting from './airtable-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { NangoError } from '@nangohq/shared';
import type { DBConnectionDecrypted } from '@nangohq/types';

const flagMocks = vi.hoisted(() => ({ allowUnauthorizedAirtableWebhook: vi.fn() }));

vi.mock('@nangohq/feature-flags', () => ({
    getFlags: () => ({ allowUnauthorizedAirtableWebhook: flagMocks.allowUnauthorizedAirtableWebhook })
}));

const WEBHOOK_ID = 'achW8bAr7fk2Rj5Tx';
const MAC_SECRET = crypto.randomBytes(32);
const REMEDIATION = 'Store the webhook macSecretBase64 in the connection metadata under webhooks.<webhook id>';

const body = { base: { id: 'appXYZ' }, webhook: { id: WEBHOOK_ID }, timestamp: '2026-09-23T00:00:00.000Z' };
const rawBody = JSON.stringify(body);

function connectionWith(metadata: Record<string, unknown> | null) {
    return { connection_id: 'conn-1', metadata } as unknown as DBConnectionDecrypted;
}

function makeNango(connections: DBConnectionDecrypted[] | null) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({ provider: 'airtable' }),
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    vi.spyOn(connectionService, 'findConnectionsByMetadataValue').mockResolvedValue(connections);
    const execute = vi.fn().mockResolvedValue({ connectionIds: ['conn-1'], connectionMetadata: {} });
    nango.executeScriptForWebhooks = execute;
    const markUnverified = vi.spyOn(nango, 'markUnverified').mockImplementation(() => undefined);

    return { nango, execute, markUnverified };
}

const withSecret = () => [connectionWith({ webhooks: { [WEBHOOK_ID]: { macSecretBase64: MAC_SECRET.toString('base64') } } })];
const withoutSecret = () => [connectionWith({ webhooks: [WEBHOOK_ID] })];

function sign(payload: string, secret = MAC_SECRET) {
    return { 'x-airtable-content-mac': `hmac-sha256=${crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')}` };
}

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

describe('airtable-webhook-routing', () => {
    beforeEach(() => {
        flagMocks.allowUnauthorizedAirtableWebhook.mockReset();
        flagMocks.allowUnauthorizedAirtableWebhook.mockResolvedValue(false);
    });

    it('routes a webhook signed with the stored mac secret', async () => {
        const { nango, execute, markUnverified } = makeNango(withSecret());

        const result = await AirtableWebhookRouting.default(nango, sign(rawBody), body, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).not.toHaveBeenCalled();
    });

    it('rejects a mac made with another secret before dispatch', async () => {
        const { nango, execute } = makeNango(withSecret());

        const result = await AirtableWebhookRouting.default(nango, sign(rawBody, crypto.randomBytes(32)), body, rawBody);

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a mac over a tampered body', async () => {
        const { nango, execute } = makeNango(withSecret());

        const result = await AirtableWebhookRouting.default(nango, sign(rawBody), body, `${rawBody} `);

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a missing mac header when a secret is stored', async () => {
        const { nango, execute } = makeNango(withSecret());

        const result = await AirtableWebhookRouting.default(nango, {}, body, rawBody);

        expect(errType(result)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('treats an empty stored secret as missing', async () => {
        const { nango, execute, markUnverified } = makeNango([connectionWith({ webhooks: { [WEBHOOK_ID]: { macSecretBase64: '' } } })]);

        const result = await AirtableWebhookRouting.default(nango, sign(rawBody, Buffer.alloc(0)), body, rawBody);

        expect(errType(result)).toBe('webhook_invalid_secret');
        expect(execute).not.toHaveBeenCalled();
        expect(markUnverified).toHaveBeenCalledOnce();
    });

    it('counts and rejects a connection without a stored secret', async () => {
        const { nango, execute, markUnverified } = makeNango(withoutSecret());

        const result = await AirtableWebhookRouting.default(nango, sign(rawBody), body, rawBody);

        expect(errType(result)).toBe('webhook_invalid_secret');
        expect(execute).not.toHaveBeenCalled();
        expect(markUnverified).toHaveBeenCalledWith({ reason: 'airtable_missing_mac_secret', remediation: REMEDIATION });
    });

    it('counts and processes a connection without a stored secret when the account is opted out', async () => {
        flagMocks.allowUnauthorizedAirtableWebhook.mockResolvedValue(true);
        const { nango, execute, markUnverified } = makeNango(withoutSecret());

        const result = await AirtableWebhookRouting.default(nango, {}, body, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).toHaveBeenCalledWith({ reason: 'airtable_missing_mac_secret', remediation: REMEDIATION });
    });

    it('rejects an unknown webhook id the same way as a missing secret', async () => {
        const { nango, execute } = makeNango(null);

        const result = await AirtableWebhookRouting.default(nango, sign(rawBody), body, rawBody);

        expect(errType(result)).toBe('webhook_invalid_secret');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a body without a webhook id', async () => {
        const { nango, execute } = makeNango(withSecret());

        const result = await AirtableWebhookRouting.default(nango, {}, { base: { id: 'appXYZ' } } as never, '{}');

        expect(errType(result)).toBe('webhook_invalid_body');
        expect(execute).not.toHaveBeenCalled();
    });
});
