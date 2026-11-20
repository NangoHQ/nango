import { afterEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as MicrosoftWebhookRouting from './microsoft-webhook-routing.js';

import type { MicrosoftGraphNotification, MicrosoftGraphNotificationPayload } from './types.js';
import type { NangoError } from '@nangohq/shared';

const CLIENT_STATE = 'a-long-enough-client-state';
const SUBSCRIPTION_ID = '50a3ecb6-cb96-49c0-b120-bb35758c3d5e';
const TENANT_ID = '99998888-7777-6666-5555-444433332222';

const userUpdated: MicrosoftGraphNotification = {
    subscriptionId: SUBSCRIPTION_ID,
    subscriptionExpirationDateTime: '2026-12-10T00:00:00.0000000Z',
    clientState: CLIENT_STATE,
    changeType: 'updated',
    resource: 'Users/11112222-3333-4444-5555-666677778888',
    tenantId: TENANT_ID,
    resourceData: {
        '@odata.type': '#Microsoft.Graph.User',
        '@odata.id': 'Users/11112222-3333-4444-5555-666677778888',
        id: '11112222-3333-4444-5555-666677778888',
        organizationId: TENANT_ID
    }
};

const reauthorizationRequired: MicrosoftGraphNotification = {
    subscriptionId: SUBSCRIPTION_ID,
    subscriptionExpirationDateTime: '2026-12-10T00:00:00.0000000Z',
    clientState: CLIENT_STATE,
    tenantId: TENANT_ID,
    lifecycleEvent: 'reauthorizationRequired'
};

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

function value(result: unknown) {
    return (
        result as {
            value: {
                content: unknown;
                statusCode: number;
                connectionIds?: string[];
                noForward?: true;
                forwardGroups?: { connectionIds: string[]; payload: unknown }[];
            };
        }
    ).value;
}

function withoutClientState({ clientState: _clientState, ...notification }: MicrosoftGraphNotification) {
    return notification;
}

function makeNango({ webhookSecret = CLIENT_STATE }: { webhookSecret?: string | null } = {}) {
    const integration = getTestConfig({ provider: 'microsoft' });
    integration.custom = webhookSecret ? { webhookSecret } : null;
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockResolvedValue({ connectionIds: ['conn-1'], connectionMetadata: {} });
    return { nango, execute };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('microsoft webhook routing', () => {
    it('echoes the validation token as plain text without routing', async () => {
        const { nango, execute } = makeNango();

        const result = await MicrosoftWebhookRouting.default(nango, {}, {}, '', { validationToken: 'token-123' });

        expect(value(result)).toEqual({ content: 'token-123', statusCode: 200, noForward: true });
        expect(execute).not.toHaveBeenCalled();
    });

    it('does not forward a validation request even when it has a body', async () => {
        const { nango, execute } = makeNango();
        const body = { value: [{ ...userUpdated, clientState: 'not-the-client-state' }] };

        const result = await MicrosoftWebhookRouting.default(nango, {}, body, JSON.stringify(body), { validationToken: 'token-123' });

        expect(value(result).noForward).toBe(true);
        expect(value(result).forwardGroups).toBeUndefined();
        expect(execute).not.toHaveBeenCalled();
    });

    it('answers an empty or malformed body without forwarding it', async () => {
        const { nango, execute } = makeNango();

        for (const body of [{}, { value: [] }, { value: 'x', injected: true }]) {
            const result = await MicrosoftWebhookRouting.default(nango, {}, body as MicrosoftGraphNotificationPayload, JSON.stringify(body), {});
            expect(value(result)).toEqual({ content: { status: 'success' }, statusCode: 200, noForward: true });
        }
        expect(execute).not.toHaveBeenCalled();
    });

    it('routes a change notification by subscriptionId, using changeType as webhook type, and strips clientState', async () => {
        const { nango, execute } = makeNango();
        const body: MicrosoftGraphNotificationPayload = { value: [userUpdated] };

        const result = await MicrosoftWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(value(result).connectionIds).toEqual(['conn-1']);
        expect(value(result).forwardGroups).toEqual([{ connectionIds: ['conn-1'], payload: { value: [withoutClientState(userUpdated)] } }]);
        expect(execute).toHaveBeenCalledWith({
            payload: withoutClientState(userUpdated),
            webhookTypeValue: 'updated',
            connectionIdentifierValue: SUBSCRIPTION_ID,
            propName: 'metadata.subscriptionIds'
        });
    });

    it('routes a lifecycle notification using lifecycleEvent as webhook type', async () => {
        const { nango, execute } = makeNango();
        const body: MicrosoftGraphNotificationPayload = { value: [reauthorizationRequired] };

        const result = await MicrosoftWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(value(result).connectionIds).toEqual(['conn-1']);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ webhookTypeValue: 'reauthorizationRequired' }));
    });

    it('drops notifications with a wrong clientState and keeps the rest', async () => {
        const { nango, execute } = makeNango();
        const forged = { ...userUpdated, clientState: 'not-the-client-state' };
        const body: MicrosoftGraphNotificationPayload = { value: [forged, reauthorizationRequired] };

        const result = await MicrosoftWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(value(result).forwardGroups).toEqual([{ connectionIds: ['conn-1'], payload: { value: [withoutClientState(reauthorizationRequired)] } }]);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('rejects when no notification has the right clientState', async () => {
        const { nango, execute } = makeNango();
        const body: MicrosoftGraphNotificationPayload = { value: [{ ...userUpdated, clientState: 'not-the-client-state' }] };

        const result = await MicrosoftWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects when the integration has no webhook secret', async () => {
        const { nango, execute } = makeNango({ webhookSecret: null });
        const body: MicrosoftGraphNotificationPayload = { value: [userUpdated] };

        const result = await MicrosoftWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(errType(result)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('forwards notifications without a subscriptionId without a connection', async () => {
        const { nango, execute } = makeNango();
        const { subscriptionId: _subscriptionId, ...noSubscription } = userUpdated;
        const body: MicrosoftGraphNotificationPayload = { value: [noSubscription] };

        const result = await MicrosoftWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(value(result).connectionIds).toEqual([]);
        expect(value(result).forwardGroups).toEqual([{ connectionIds: [], payload: { value: [withoutClientState(noSubscription)] } }]);
        expect(execute).not.toHaveBeenCalled();
    });

    it('routes mail and calendar notifications from one payload by their own subscriptionId', async () => {
        const { nango, execute } = makeNango();
        const mail: MicrosoftGraphNotification = {
            subscriptionId: 'sub-mail',
            clientState: CLIENT_STATE,
            changeType: 'created',
            resource: 'Users/u1/Messages/m1'
        };
        const event: MicrosoftGraphNotification = {
            subscriptionId: 'sub-calendar',
            clientState: CLIENT_STATE,
            changeType: 'updated',
            resource: 'Users/u1/Events/e1'
        };
        const body: MicrosoftGraphNotificationPayload = { value: [mail, event] };

        const result = await MicrosoftWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(value(result).connectionIds).toEqual(['conn-1']);
        expect(value(result).forwardGroups).toEqual([{ connectionIds: ['conn-1'], payload: { value: [withoutClientState(mail), withoutClientState(event)] } }]);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ connectionIdentifierValue: 'sub-mail', webhookTypeValue: 'created' }));
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ connectionIdentifierValue: 'sub-calendar', webhookTypeValue: 'updated' }));
    });

    it('forwards each connection only its own notifications from a mixed batch', async () => {
        const { nango, execute } = makeNango();
        const forConnection: Record<string, string[]> = { 'sub-a': ['conn-a'], 'sub-b': ['conn-b'], 'sub-shared': ['conn-a', 'conn-b'] };
        execute.mockImplementation(({ connectionIdentifierValue }) =>
            Promise.resolve({ connectionIds: forConnection[connectionIdentifierValue as string] ?? [], connectionMetadata: {} })
        );
        const a: MicrosoftGraphNotification = { subscriptionId: 'sub-a', clientState: CLIENT_STATE, changeType: 'created', resource: 'Users/a/Messages/1' };
        const b: MicrosoftGraphNotification = { subscriptionId: 'sub-b', clientState: CLIENT_STATE, changeType: 'created', resource: 'Users/b/Messages/2' };
        const shared: MicrosoftGraphNotification = {
            subscriptionId: 'sub-shared',
            clientState: CLIENT_STATE,
            changeType: 'updated',
            resource: 'Users/s/Events/3'
        };
        const unknown: MicrosoftGraphNotification = {
            subscriptionId: 'sub-unknown',
            clientState: CLIENT_STATE,
            changeType: 'deleted',
            resource: 'Users/x/Messages/4'
        };
        const body: MicrosoftGraphNotificationPayload = { value: [a, b, shared, unknown] };

        const result = await MicrosoftWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(value(result).connectionIds).toEqual(['conn-a', 'conn-b']);
        expect(value(result).forwardGroups).toEqual([
            { connectionIds: ['conn-a'], payload: { value: [withoutClientState(a), withoutClientState(shared)] } },
            { connectionIds: ['conn-b'], payload: { value: [withoutClientState(b), withoutClientState(shared)] } },
            { connectionIds: [], payload: { value: [withoutClientState(unknown)] } }
        ]);
    });
});
