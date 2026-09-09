import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as CheckrWebhookRouting from './checkr-partner-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { NangoError } from '@nangohq/shared';

const WEBHOOK_SECRET = 'checkr-webhook-secret';

function makeNango({ webhookSecret }: { webhookSecret?: string } = {}) {
    const integration = getTestConfig({ provider: 'checkr-partner', ...(webhookSecret ? { custom: { webhookSecret } } : {}) });
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

function sign(rawBody: string, secret = WEBHOOK_SECRET) {
    return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

const body = { id: 'evt_1', type: 'report.completed', account_id: 'acct_1' };
const rawBody = JSON.stringify(body);

describe('checkr-partner-webhook-routing', () => {
    it('routes a correctly signed webhook', async () => {
        const { nango, execute, markUnverified } = makeNango({ webhookSecret: WEBHOOK_SECRET });

        const result = await CheckrWebhookRouting.default(nango, { 'x-checkr-signature': sign(rawBody) }, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).not.toHaveBeenCalled();
    });

    it('rejects an invalid signature before dispatch', async () => {
        const { nango, execute } = makeNango({ webhookSecret: WEBHOOK_SECRET });

        const result = await CheckrWebhookRouting.default(nango, { 'x-checkr-signature': sign(rawBody, 'wrong-secret') }, body as never, rawBody);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a signature over a tampered body before dispatch', async () => {
        const { nango, execute } = makeNango({ webhookSecret: WEBHOOK_SECRET });

        const result = await CheckrWebhookRouting.default(nango, { 'x-checkr-signature': sign(rawBody) }, body as never, `${rawBody} `);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a missing signature header whether or not a secret is set', async () => {
        for (const opts of [{ webhookSecret: WEBHOOK_SECRET }, {}]) {
            const { nango, execute } = makeNango(opts);

            const result = await CheckrWebhookRouting.default(nango, {}, body as never, rawBody);

            expect(result.isErr()).toBe(true);
            expect(errType(result)).toBe('webhook_missing_signature');
            expect(execute).not.toHaveBeenCalled();
        }
    });

    it('marks the webhook unverified and still routes it when no secret is configured', async () => {
        const { nango, execute, markUnverified } = makeNango();

        const result = await CheckrWebhookRouting.default(nango, { 'x-checkr-signature': 'anything' }, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).toHaveBeenCalledWith({
            reason: 'checkr_missing_webhook_secret',
            remediation: 'Set the Checkr webhook secret on the integration'
        });
    });
});
