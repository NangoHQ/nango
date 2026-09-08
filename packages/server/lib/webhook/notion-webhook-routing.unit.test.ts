import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as NotionWebhookRouting from './notion-webhook-routing.js';

import type { NangoError } from '@nangohq/shared';

const VERIFICATION_TOKEN = 'notion-verification-token';

function makeNango({ verificationToken }: { verificationToken?: string } = { verificationToken: VERIFICATION_TOKEN }) {
    const integration = getTestConfig({ provider: 'notion', ...(verificationToken ? { custom: { webhookSecret: verificationToken } } : {}) });
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const execute = vi.fn().mockResolvedValue({ connectionIds: ['conn-1'], connectionMetadata: {} });
    nango.executeScriptForWebhooks = execute;
    const markUnverified = vi.spyOn(nango, 'markUnverified').mockImplementation(() => undefined);

    return { nango, execute, markUnverified };
}

function sign(rawBody: string, secret = VERIFICATION_TOKEN) {
    return `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

const event = { type: 'page.created', workspace_id: 'ws-1' };
const rawEvent = JSON.stringify(event);

describe('notion-webhook-routing', () => {
    it('terminates the verification handshake without dispatching', async () => {
        const { nango, execute } = makeNango({});
        const handshake = { verification_token: 'token-from-notion' };

        const result = await NotionWebhookRouting.default(nango, {}, handshake as never, JSON.stringify(handshake));

        expect(result.isOk()).toBe(true);
        expect(result.unwrap().statusCode).toBe(200);
        expect(execute).not.toHaveBeenCalled();
    });

    it('forwards only the token on the handshake', async () => {
        const { nango } = makeNango({});
        const handshake = { verification_token: 'token-from-notion' };

        const result = await NotionWebhookRouting.default(nango, {}, handshake as never, JSON.stringify(handshake));

        expect(result.isOk()).toBe(true);
        expect(result.unwrap()).toMatchObject({ toForward: { verification_token: 'token-from-notion' } });
    });

    it('accepts a token only handshake even when a token is already configured', async () => {
        // Notion sends a fresh handshake when a subscription is recreated, so a configured
        // integration still has to be able to receive one or rotation is impossible.
        const { nango, execute } = makeNango();
        const handshake = { verification_token: 'replacement-token' };

        const result = await NotionWebhookRouting.default(nango, {}, handshake as never, JSON.stringify(handshake));

        expect(result.isOk()).toBe(true);
        expect(result.unwrap()).toMatchObject({ toForward: { verification_token: 'replacement-token' } });
        expect(execute).not.toHaveBeenCalled();
    });

    it('does not treat an event carrying a verification_token as a handshake', async () => {
        // verification_token can be set on any payload, so only a body that is nothing but the
        // token counts. Anything else goes through validation.
        const { nango, execute } = makeNango();
        const forged = { verification_token: 'anything', type: 'page.created', workspace_id: 'ws-1' };

        const result = await NotionWebhookRouting.default(nango, {}, forged as never, JSON.stringify(forged));

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('routes a correctly signed event', async () => {
        const { nango, execute, markUnverified } = makeNango();

        const result = await NotionWebhookRouting.default(nango, { 'x-notion-signature': sign(rawEvent) }, event as never, rawEvent);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).not.toHaveBeenCalled();
    });

    it('rejects an unsigned event when a verification token is configured', async () => {
        const { nango, execute } = makeNango();

        const result = await NotionWebhookRouting.default(nango, {}, event as never, rawEvent);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an invalid signature', async () => {
        const { nango, execute } = makeNango();

        const result = await NotionWebhookRouting.default(nango, { 'x-notion-signature': sign(rawEvent, 'wrong') }, event as never, rawEvent);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('marks the event unverified and still routes it when no token is configured', async () => {
        const { nango, execute, markUnverified } = makeNango({});

        const result = await NotionWebhookRouting.default(nango, {}, event as never, rawEvent);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).toHaveBeenCalledWith({
            reason: 'notion_missing_verification_token',
            remediation: 'Set the verification token on the integration'
        });
    });
});
