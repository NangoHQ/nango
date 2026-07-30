import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import {
    auditConnectionUpdated,
    auditEnvironmentVariablesChanged,
    auditEnvironmentWebhookUrlsChanged,
    auditMfaEnabled,
    auditPublicConnectionDeleted
} from './audit.middleware.js';

import type { RequestHandler } from 'express';

const recordMock = vi.hoisted(() => vi.fn());
vi.mock('../audit.js', () => ({ audit: { record: recordMock } }));

function fakeReq(overrides: Record<string, unknown> = {}) {
    return {
        params: {},
        query: {},
        body: {},
        ip: '203.0.113.7',
        get: (h: string) => (h.toLowerCase() === 'user-agent' ? 'vitest' : undefined),
        ...overrides
    } as any;
}

function fakeRes(locals: Record<string, unknown>, statusCode = 200) {
    const res = new EventEmitter() as any;
    res.locals = locals;
    res.statusCode = statusCode;
    res.json = (body: unknown) => body;
    return res;
}

const locals = {
    account: { id: 42, uuid: 'acc-uuid' },
    environment: { id: 9, name: 'dev' },
    authType: 'session',
    user: { id: 7, email: 'dev@example.com' }
};

// Invoke the middleware, wait for it to call next() (resolution done), fire the response 'finish'
// event that triggers the emit, and return the recorded event.
async function runAudit(handler: RequestHandler, req: any, res: any) {
    await new Promise<void>((resolve) => handler(req, res, () => resolve()));
    res.emit('finish');
    await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());
    return recordMock.mock.calls[0]?.[0];
}

describe('auditable() middleware behavior (unit)', () => {
    beforeEach(() => {
        recordMock.mockReset().mockResolvedValue({ isErr: () => false });
        flags.hasAuditTrail = true;
    });

    afterEach(() => {
        flags.hasAuditTrail = false;
    });

    it('builds the event and records variable names but never their values', async () => {
        const req = fakeReq({
            body: {
                variables: [
                    { name: 'API_URL', value: 'https://secret.example' },
                    { name: 'TOKEN', value: 'super-secret-value' }
                ]
            }
        });
        const event = await runAudit(auditEnvironmentVariablesChanged, req, fakeRes(locals));

        expect(event).toMatchObject({
            resource: 'environment',
            action: 'variables_changed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'environment', id: '9', display: 'dev' }],
            metadata: { variableCount: 2, variableNames: ['API_URL', 'TOKEN'] },
            context: { ip: '203.0.113.7', userAgent: 'vitest' }
        });
        const serialized = JSON.stringify(event);
        expect(serialized).not.toContain('super-secret-value');
        expect(serialized).not.toContain('secret.example');
    });

    it('connection update: records changed field names + provider, never the submitted value', async () => {
        const req = fakeReq({
            params: { connectionId: 'conn-1' },
            query: { provider_config_key: 'algolia' },
            body: { webhook_url_override: 'https://leaked-value.test/hook' }
        });
        const event = await runAudit(auditConnectionUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'connection',
            action: 'updated',
            outcome: 'success',
            targets: [{ type: 'connection', id: 'conn-1' }],
            metadata: { providerConfigKey: 'algolia', changedFields: ['webhook_url_override'] }
        });
        expect(JSON.stringify(event)).not.toContain('leaked-value');
    });

    it('webhook settings: records only the URL origin, never the path or secret query params', async () => {
        const req = fakeReq({ body: { primary_url: 'https://hooks.example/primary?token=shh-secret' } });
        const event = await runAudit(auditEnvironmentWebhookUrlsChanged, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'environment',
            action: 'webhook_urls_changed',
            metadata: { primaryUrl: 'https://hooks.example' }
        });
        expect(JSON.stringify(event)).not.toContain('shh-secret');
    });

    it('maps the response status to an outcome (403 → denied, 5xx → failure)', async () => {
        const denied = await runAudit(auditEnvironmentVariablesChanged, fakeReq({ body: { variables: [] } }), fakeRes(locals, 403));
        expect(denied).toMatchObject({ outcome: 'denied' });
        recordMock.mockClear();
        const failed = await runAudit(auditEnvironmentVariablesChanged, fakeReq({ body: { variables: [] } }), fakeRes(locals, 500));
        expect(failed).toMatchObject({ outcome: 'failure' });
    });

    it('mfa activation: failure outcome on a rejected code, and the submitted code is never recorded', async () => {
        const req = fakeReq({ body: { code: '000000' } });
        const event = await runAudit(auditMfaEnabled, req, fakeRes(locals, 400));
        expect(event).toMatchObject({
            resource: 'mfa',
            action: 'enabled',
            outcome: 'failure',
            accountId: 42,
            // account-scoped policy → environment is never attributed.
            environment: null,
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'user', id: '7', display: 'dev@example.com' }]
        });
        expect(JSON.stringify(event)).not.toContain('000000');
    });

    it('resolves an api_key actor (secret-key auth) rather than a user', async () => {
        const apiKeyLocals = {
            account: { id: 42, uuid: 'acc-uuid' },
            environment: { id: 9, name: 'dev' },
            authType: 'secretKey',
            apiKeyId: 5,
            apiKeyDisplayName: 'ci-key'
        };
        const req = fakeReq({ params: { connectionId: 'conn-1' }, query: { provider_config_key: 'algolia' } });
        const event = await runAudit(auditPublicConnectionDeleted, req, fakeRes(apiKeyLocals));
        expect(event).toMatchObject({
            resource: 'connection',
            action: 'deleted',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            actor: { type: 'api_key', id: '5', display: 'ci-key' },
            targets: [{ type: 'connection', id: 'conn-1' }],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    // The per-account entitlement branch needs plans enabled, so it lives in audit.integration.test.ts.
    it('records nothing when the audit trail is disabled for the deployment', async () => {
        flags.hasAuditTrail = false;
        const req = fakeReq({ body: { variables: [{ name: 'X', value: 'y' }] } });
        const res = fakeRes(locals);

        await new Promise<void>((resolve) => auditEnvironmentVariablesChanged(req, res, () => resolve()));
        res.emit('finish');
        // Give the fire-and-forget finish hook a tick, then confirm the gate short-circuited it.
        await new Promise((resolve) => setImmediate(resolve));
        expect(recordMock).not.toHaveBeenCalled();
    });

    it('resolves the target BEFORE next() — a later mutation of res.locals cannot change it', async () => {
        const req = fakeReq({ body: { variables: [{ name: 'X', value: 'y' }] } });
        const res = fakeRes({ ...locals, environment: { id: 9, name: 'dev' } });

        await new Promise<void>((resolve) => auditEnvironmentVariablesChanged(req, res, () => resolve()));
        // Simulate a controller swapping the environment out after the middleware yielded.
        res.locals.environment = { id: 999, name: 'moved' };
        res.emit('finish');

        await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());
        // Target was captured pre-next, so it still points at the original environment.
        expect(recordMock.mock.calls[0]?.[0]?.targets).toEqual([{ type: 'environment', id: '9', display: 'dev' }]);
    });
});
