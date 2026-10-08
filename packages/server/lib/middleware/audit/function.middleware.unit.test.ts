import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import {
    auditFunctionDeleted,
    auditFunctionDeployedCli,
    auditFunctionDeployedFromTemplate,
    auditFunctionDeploymentBundle,
    auditFunctionUpdated,
    auditFunctionUpgraded,
    auditFunctionVariantCreated,
    auditFunctionVariantDeleted,
    auditFunctionVariantUpdated,
    auditPreBuiltDeployed,
    auditPublicFunctionDeleted
} from './function.middleware.js';
import { fakeReq, fakeRes, installAuditMockDefaults, locals, recordMock, resetAuditMocks, runAudit, secretKeyLocals } from './testing.js';

import type { RequestHandler } from 'express';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
const { searchFunctionMock } = vi.hoisted(() => ({ searchFunctionMock: vi.fn() }));
vi.mock('@nangohq/shared', async (importOriginal) => ({
    ...(await (await import('./testing.js')).sharedModuleMock(importOriginal as never)),
    functionConfigService: { search: searchFunctionMock }
}));

const functionUuid = 'f0000000-0000-4000-8000-000000000001';

describe('function audit middleware (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
        searchFunctionMock.mockReset().mockResolvedValue(Ok([{ config: { name: 'fetchIssues' } }]));
    });

    afterEach(() => {
        resetAuditMocks();
    });

    it.each([
        ['variant_created', auditFunctionVariantCreated],
        ['variant_deleted', auditFunctionVariantDeleted],
        ['variant_updated', auditFunctionVariantUpdated]
    ] as const)('%s records the function, connection and variant for success, denial and failure', async (action, handler) => {
        for (const [status, outcome] of [
            [200, 'success'],
            [403, 'denied'],
            [500, 'failure']
        ] as const) {
            recordMock.mockClear();
            const req = fakeReq({
                params: { functionUuid, connectionId: 'connection', variant: action === 'variant_created' ? 'wrong-param-variant' : 'custom' },
                body: { variant: action === 'variant_created' ? 'custom' : 'wrong-body-variant' }
            });
            const event = await runAudit(handler, req, fakeRes(secretKeyLocals, status));
            expect(event).toMatchObject({
                resource: 'function',
                action,
                outcome,
                accountId: 42,
                environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
                actor: { type: 'api_key', id: 'c0000000-0000-4000-8000-000000000005', display: 'ci-key' },
                targets: [{ type: 'function', id: functionUuid, display: 'fetchIssues' }],
                metadata: { connectionId: 'connection', variant: 'custom' }
            });
            expect(searchFunctionMock).toHaveBeenCalledWith(expect.anything(), { environmentId: 9, filter: { uuid: functionUuid } });
        }
    });

    it.each([
        [200, 'success'],
        [403, 'denied'],
        [500, 'failure']
    ] as const)('base variant update records settings on %s', async (status, outcome) => {
        const req = fakeReq({ params: { functionUuid, connectionId: 'connection' }, body: { enabled: false, frequency: null } });
        const event = await runAudit(auditFunctionVariantUpdated, req, fakeRes(secretKeyLocals, status));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'variant_updated',
            outcome,
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            actor: { type: 'api_key', id: 'c0000000-0000-4000-8000-000000000005', display: 'ci-key' },
            targets: [{ type: 'function', id: functionUuid, display: 'fetchIssues' }],
            metadata: { connectionId: 'connection', variant: 'base', enabled: false, frequency: null }
        });
    });

    it.each([
        ['private', auditFunctionDeleted, { providerConfigKey: 'algolia', functionName: 'contacts' }],
        ['public', auditPublicFunctionDeleted, { uniqueKey: 'algolia', name: 'contacts' }]
    ])('%s function delete: the target matches what a deploy recorded', async (_name, handler, params) => {
        const req = fakeReq({ params, query: { type: 'sync' } });
        const event = await runAudit(handler as RequestHandler, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'deleted',
            outcome: 'success',
            targets: [{ type: 'function', id: 'algolia:contacts' }]
        });
        expect(event?.metadata).toEqual({ type: 'sync' });
    });

    it('bulk CLI deploy: one target per flow, naming the integration it went to', async () => {
        const req = fakeReq({
            body: {
                flowConfigs: [
                    {
                        type: 'sync',
                        syncName: 'flow-a',
                        providerConfigKey: 'algolia',
                        models: [],
                        runs: 'every day',
                        track_deletes: false,
                        fileBody: { js: '', ts: '' }
                    },
                    {
                        type: 'action',
                        syncName: 'flow-b',
                        providerConfigKey: 'algolia',
                        models: [],
                        runs: null,
                        track_deletes: false,
                        fileBody: { js: '', ts: '' }
                    }
                ],
                nangoYamlBody: '',
                reconcile: false,
                debug: false
            }
        });
        const event = await runAudit(auditFunctionDeployedCli, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'deployed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            actor: { type: 'api_key', id: 'c0000000-0000-4000-8000-000000000005', display: 'ci-key' },
            targets: [
                { type: 'function', id: 'algolia:flow-a' },
                { type: 'function', id: 'algolia:flow-b' }
            ]
        });
        // The controller defaults the source the same way, and that default is what gets persisted.
        expect(event?.metadata).toEqual({ source: 'repo' });
    });

    it('native function bundle deploy: one target per function without recording source code', async () => {
        const req = fakeReq({
            body: {
                functions: [
                    { integrationId: 'github', name: 'fetchIssues', fileBody: { js: 'secret compiled code', ts: 'secret source code' } },
                    { integrationId: 'gitlab', name: 'fetchIssues', fileBody: { js: 'other compiled code', ts: 'other source code' } }
                ]
            }
        });
        const event = await runAudit(auditFunctionDeploymentBundle, req, fakeRes(secretKeyLocals));

        expect(event).toMatchObject({
            resource: 'function',
            action: 'deployed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            actor: { type: 'api_key', id: 'c0000000-0000-4000-8000-000000000005', display: 'ci-key' },
            targets: [
                { type: 'function', id: 'github:fetchIssues' },
                { type: 'function', id: 'gitlab:fetchIssues' }
            ],
            metadata: { type: 'function' }
        });
        expect(JSON.stringify(event)).not.toContain('secret');
    });

    it('pre-built flow upgrade: the script name is the target, provider + version in metadata', async () => {
        const req = fakeReq({
            body: { id: 1, provider: 'algolia', scriptName: 'my-sync', type: 'sync', upgradeVersion: '2.0.0', providerConfigKey: 'algolia' }
        });
        const event = await runAudit(auditFunctionUpgraded, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'upgraded',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            targets: [{ type: 'function', id: 'algolia:my-sync' }],
            metadata: { upgradeVersion: '2.0.0' }
        });
    });

    it('template deploy through the API: recorded as a catalog deploy', async () => {
        const req = fakeReq({ body: { type: 'template', integration_id: 'algolia', template: 'contacts', function_type: 'sync' } });
        const event = await runAudit(auditFunctionDeployedFromTemplate, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'deployed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            targets: [{ type: 'function', id: 'algolia:contacts' }],
            metadata: { source: 'catalog', type: 'sync' }
        });
    });

    it.each([
        ['an unknown type', 'bogus'],
        ['no type at all', undefined]
    ])('records nothing for %s', async (_name, type) => {
        const req = fakeReq({ body: { ...(type ? { type } : {}), integration_id: 'algolia', template: 'contacts' } });
        const res = fakeRes(secretKeyLocals);
        await new Promise<void>((resolve) => auditFunctionDeployedFromTemplate(req, res, () => resolve()));
        res.emit('finish');
        await new Promise((resolve) => setImmediate(resolve));
        expect(recordMock).not.toHaveBeenCalled();
    });

    it('code deploy through the API records nothing: the sandbox CLI deploy is what gets recorded', async () => {
        const req = fakeReq({ body: { type: 'function', integration_id: 'algolia', function_name: 'my-func', function_type: 'action', code: '' } });
        const res = fakeRes(secretKeyLocals);
        await new Promise<void>((resolve) => auditFunctionDeployedFromTemplate(req, res, () => resolve()));
        res.emit('finish');
        await new Promise((resolve) => setImmediate(resolve));
        expect(recordMock).not.toHaveBeenCalled();
    });

    it('pre-built template deploy: the same shape as the API catalog deploy', async () => {
        const req = fakeReq({ body: { providerConfigKey: 'algolia', scriptName: 'my-prebuilt-sync', type: 'sync' } });
        const event = await runAudit(auditPreBuiltDeployed, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'deployed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            targets: [{ type: 'function', id: 'algolia:my-prebuilt-sync' }]
        });
        expect(event?.metadata).toEqual({ source: 'catalog', type: 'sync' });
    });

    it('function update: the uuid is the target, the requested state is the metadata', async () => {
        const req = fakeReq({ params: { uuid: 'f0000000-0000-4000-8000-000000000042' }, body: { state: 'disabled' } });
        const event = await runAudit(auditFunctionUpdated, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'updated',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            actor: { type: 'api_key', id: 'c0000000-0000-4000-8000-000000000005', display: 'ci-key' },
            targets: [{ type: 'function', id: 'f0000000-0000-4000-8000-000000000042' }],
            metadata: { state: 'disabled' }
        });
    });

    it('function update: a denied request still records the attempt', async () => {
        const req = fakeReq({ params: { uuid: 'f0000000-0000-4000-8000-000000000042' }, body: { state: 'enabled' } });
        const event = await runAudit(auditFunctionUpdated, req, fakeRes(secretKeyLocals, 403));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'updated',
            outcome: 'denied',
            targets: [{ type: 'function', id: 'f0000000-0000-4000-8000-000000000042' }],
            metadata: { state: 'enabled' }
        });
    });
});
