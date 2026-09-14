import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as JobDivaWebhookRouting from './jobdiva-webhook-routing.js';

import type { NangoError } from '@nangohq/shared';

const WEBHOOK_SECRET = 'jobdiva-webhook-secret';

function makeNango({ webhookSecret }: { webhookSecret?: string } = { webhookSecret: WEBHOOK_SECRET }) {
    const integration = getTestConfig({ provider: 'jobdiva', ...(webhookSecret ? { custom: { webhookSecret } } : {}) });
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
    return `sha1=${crypto.createHmac('sha1', secret).update(rawBody).digest('hex')}`;
}

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

const body = { type: 'candidate', operation: 'created' };
const rawBody = JSON.stringify(body);

describe('jobdiva-webhook-routing', () => {
    it('routes a correctly signed webhook', async () => {
        // Node lowercases incoming header names. Reading the mixed case name meant every signed
        // webhook was rejected whenever a secret was configured.
        const { nango, execute } = makeNango();

        const result = await JobDivaWebhookRouting.default(nango, { 'x-hub-signature': sign(rawBody) }, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('rejects a forged signature before dispatch', async () => {
        const { nango, execute } = makeNango();

        const result = await JobDivaWebhookRouting.default(nango, { 'x-hub-signature': sign(rawBody, 'wrong-secret') }, body as never, rawBody);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a missing signature when a secret is configured', async () => {
        const { nango, execute } = makeNango();

        const result = await JobDivaWebhookRouting.default(nango, {}, body as never, rawBody);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('marks the webhook unverified and still routes it when no secret is configured', async () => {
        const { nango, execute, markUnverified } = makeNango({});

        const result = await JobDivaWebhookRouting.default(nango, {}, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).toHaveBeenCalledWith({ reason: 'jobdiva_missing_webhook_secret' });
    });
});
