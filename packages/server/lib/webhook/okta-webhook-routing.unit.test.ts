import { afterEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { connectionService, seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as OktaWebhookRouting from './okta-webhook-routing.js';

import type { OktaEventHookPayload, OktaLogEvent } from './types.js';
import type { NangoError } from '@nangohq/shared';
import type { DBConnectionDecrypted } from '@nangohq/types';

const SECRET = 'a-long-enough-webhook-secret';
const OTHER_SECRET = 'another-long-enough-secret';

const deactivateEvent: OktaLogEvent = {
    uuid: 'f1d0b993-cc19-11ed-a688-db22c99ef6c4',
    published: '2026-03-26T21:05:32.159Z',
    eventType: 'user.lifecycle.deactivate',
    displayMessage: 'Deactivate Okta user',
    target: [{ id: '00u3m90rxKjGQ0G6L1d6', type: 'User', alternateId: 'john.doe@example.com', displayName: 'John Doe' }]
};
const loginEvent: OktaLogEvent = { ...deactivateEvent, uuid: 'a2b3c4d5-cc19-11ed-a688-db22c99ef6c4', eventType: 'user.session.start' };

function getBody(source = 'https://acme.okta.com/api/v1/eventHooks/who7hphp39JoHLni81d7', events: OktaLogEvent[] = [deactivateEvent]): OktaEventHookPayload {
    return {
        eventType: 'com.okta.event_hook',
        eventTypeVersion: '1.0',
        cloudEventsVersion: '0.1',
        source,
        eventId: '85b60edb-4263-4e13-993b-818e26201052',
        eventTime: '2026-03-28T17:03:37.093Z',
        contentType: 'application/json',
        data: { events }
    };
}

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

function value(result: unknown) {
    return (result as { value: { content: unknown; statusCode: number; connectionIds?: string[]; toForward?: unknown } }).value;
}

function dbConnection(connectionId: string, webhookSecret?: string) {
    return { connection_id: connectionId, metadata: webhookSecret ? { webhookSecret } : null } as unknown as DBConnectionDecrypted;
}

function makeNango({ method = 'POST', allowUnverifiedWebhooks = false }: { method?: 'GET' | 'POST'; allowUnverifiedWebhooks?: boolean } = {}) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({ provider: 'okta', allow_unverified_webhooks: allowUnverifiedWebhooks }),
        request: { method, path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const execute = vi
        .spyOn(nango, 'executeScriptForWebhooks')
        .mockImplementation(({ connectionIdentifierValue }) =>
            Promise.resolve({ connectionIds: connectionIdentifierValue ? [connectionIdentifierValue] : [], connectionMetadata: {} })
        );
    return { nango, execute };
}

function withConnections(byConfig: { hostname?: Record<string, DBConnectionDecrypted[]>; subdomain?: Record<string, DBConnectionDecrypted[]> }) {
    return vi
        .spyOn(connectionService, 'findConnectionsByConnectionConfigValue')
        .mockImplementation((key, value) => Promise.resolve(byConfig[key as 'hostname' | 'subdomain']?.[value] ?? null));
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('okta webhook routing', () => {
    it('answers the verification challenge on GET without routing', async () => {
        const { nango, execute } = makeNango({ method: 'GET' });
        const lookup = withConnections({});

        const result = await OktaWebhookRouting.default(nango, { 'x-okta-verification-challenge': 'challenge-value' }, {} as OktaEventHookPayload, '', {});

        expect(value(result)).toEqual({ content: { verification: 'challenge-value' }, statusCode: 200, noForward: true });
        expect(lookup).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a GET without a verification challenge', async () => {
        const { nango } = makeNango({ method: 'GET' });

        const result = await OktaWebhookRouting.default(nango, {}, {} as OktaEventHookPayload, '', {});

        expect(errType(result)).toBe('webhook_invalid_body');
    });

    it('routes each event to the connection whose subdomain matches the source org, using eventType as webhook type', async () => {
        const { nango, execute } = makeNango();
        const lookup = withConnections({ subdomain: { acme: [dbConnection('conn-1', SECRET)] } });
        const body = getBody(undefined, [deactivateEvent, loginEvent]);

        const result = await OktaWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, body, JSON.stringify(body), {});

        expect(value(result).connectionIds).toEqual(['conn-1']);
        expect(value(result).toForward).toEqual(body);
        expect(lookup).toHaveBeenCalledWith('hostname', 'acme.okta.com', nango.environment.id, nango.integration.id);
        expect(lookup).toHaveBeenCalledWith('subdomain', 'acme', nango.environment.id, nango.integration.id);
        expect(execute).toHaveBeenCalledTimes(2);
        expect(execute).toHaveBeenNthCalledWith(1, {
            payload: deactivateEvent,
            webhookTypeValue: 'user.lifecycle.deactivate',
            connectionIdentifierValue: 'conn-1',
            propName: 'connectionId'
        });
        expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ payload: loginEvent, webhookTypeValue: 'user.session.start' }));
    });

    it('routes a custom domain org by hostname without a subdomain lookup', async () => {
        const { nango } = makeNango();
        const lookup = withConnections({ hostname: { 'login.acme.com': [dbConnection('conn-1', SECRET)] } });
        const body = getBody('https://login.acme.com/api/v1/eventHooks/who7hphp39JoHLni81d7');

        const result = await OktaWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, body, JSON.stringify(body), {});

        expect(value(result).connectionIds).toEqual(['conn-1']);
        expect(lookup).toHaveBeenCalledTimes(1);
    });

    it('routes only to the connections whose secret matches', async () => {
        const { nango, execute } = makeNango();
        withConnections({
            hostname: { 'acme.okta.com': [dbConnection('conn-1', SECRET)] },
            subdomain: { acme: [dbConnection('conn-1', SECRET), dbConnection('conn-2', OTHER_SECRET)] }
        });
        const body = getBody();

        const result = await OktaWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, body, JSON.stringify(body), {});

        expect(value(result).connectionIds).toEqual(['conn-1']);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('rejects a wrong or missing secret', async () => {
        const { nango, execute } = makeNango();
        withConnections({ subdomain: { acme: [dbConnection('conn-1', SECRET)] } });
        const body = getBody();

        const wrong = await OktaWebhookRouting.default(nango, { 'x-nango-webhook-secret': OTHER_SECRET }, body, JSON.stringify(body), {});
        const missing = await OktaWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(errType(wrong)).toBe('webhook_invalid_signature');
        expect(errType(missing)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an unknown org the same way as a wrong secret', async () => {
        const { nango, execute } = makeNango();
        withConnections({});
        const body = getBody('https://unknown.okta.com/api/v1/eventHooks/who7hphp39JoHLni81d7');

        const result = await OktaWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, body, JSON.stringify(body), {});

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a delivery without a valid source', async () => {
        const { nango, execute } = makeNango();
        const lookup = withConnections({});
        const body = { ...getBody(), source: 'not a url' };

        const result = await OktaWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, body, JSON.stringify(body), {});

        expect(errType(result)).toBe('webhook_invalid_body');
        expect(lookup).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a delivery without a data.events array instead of acknowledging it', async () => {
        for (const data of [undefined, {}, { events: 'not an array' }]) {
            const { nango, execute } = makeNango();
            const lookup = withConnections({ subdomain: { acme: [dbConnection('conn-1')] } });
            const body = { ...getBody(), data } as OktaEventHookPayload;

            const result = await OktaWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, body, JSON.stringify(body), {});

            expect(errType(result)).toBe('webhook_invalid_body');
            expect(lookup).not.toHaveBeenCalled();
            expect(execute).not.toHaveBeenCalled();
        }
    });

    it('rejects a connection without a secret, even when the integration allows unverified webhooks', async () => {
        const body = getBody();
        withConnections({ subdomain: { acme: [dbConnection('conn-1')] } });

        for (const allowUnverifiedWebhooks of [false, true]) {
            const { nango, execute } = makeNango({ allowUnverifiedWebhooks });
            const result = await OktaWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

            expect(errType(result)).toBe('webhook_missing_signature');
            expect(execute).not.toHaveBeenCalled();
        }
    });
});
