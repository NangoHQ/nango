import { beforeEach, describe, expect, it, vi } from 'vitest';

import route from './attio-webhook-routing.js';

import type { AttioWebhook } from './types.js';
import type * as NangoShared from '@nangohq/shared';
import type * as NangoUtils from '@nangohq/utils';

const mocks = vi.hoisted(() => ({
    isAttioWebhookDedupeEnabled: vi.fn(),
    set: vi.fn(),
    deleteIfValueEquals: vi.fn(),
    findConnectionsByConnectionConfigValue: vi.fn(),
    increment: vi.fn(),
    report: vi.fn()
}));

vi.mock('@nangohq/feature-flags', () => ({
    getFlags: () => ({ isAttioWebhookDedupeEnabled: mocks.isAttioWebhookDedupeEnabled })
}));
vi.mock('@nangohq/kvstore', () => ({ getKVStore: () => ({ set: mocks.set, deleteIfValueEquals: mocks.deleteIfValueEquals }) }));
vi.mock('@nangohq/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof NangoShared>();
    return {
        ...actual,
        connectionService: { findConnectionsByConnectionConfigValue: mocks.findConnectionsByConnectionConfigValue }
    };
});
vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof NangoUtils>();
    return {
        ...actual,
        metrics: { ...actual.metrics, increment: mocks.increment },
        report: mocks.report
    };
});

function event(
    eventType: AttioWebhook['events'][number]['event_type'],
    id: Partial<AttioWebhook['events'][number]['id']> = {}
): AttioWebhook['events'][number] {
    return {
        event_type: eventType,
        id: {
            workspace_id: 'workspace-1',
            object_id: 'object-1',
            record_id: 'record-1',
            ...id
        },
        actor: { type: 'user', id: 'actor-1' }
    };
}

function makeNango() {
    return {
        team: { id: 1, uuid: 'account-uuid' },
        environment: { id: 2 },
        integration: { id: 3, custom: {} },
        executeScriptForWebhooks: vi.fn().mockResolvedValue({ connectionIds: ['conn-1'] })
    };
}

describe('Attio webhook routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isAttioWebhookDedupeEnabled.mockResolvedValue(true);
        mocks.set.mockResolvedValue(undefined);
        mocks.deleteIfValueEquals.mockResolvedValue(true);
        mocks.findConnectionsByConnectionConfigValue.mockResolvedValue([{ connection_id: 'conn-1' }]);
    });

    it('dedupes record events by record and event class without the attribute id', async () => {
        const nango = makeNango();
        mocks.set.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('set_key_already_exists'));
        const body: AttioWebhook = {
            webhook_id: 'webhook-1',
            events: [
                event('record.created', { attribute_id: 'attribute-1' }),
                event('record.updated', { attribute_id: 'attribute-2' }),
                event('record.deleted'),
                event('record.merged')
            ]
        };

        await route(nango as never, {}, body, '');

        expect(mocks.set).toHaveBeenNthCalledWith(1, 'attio:dedupe:2:3:workspace-1:object-1:record-1:fetch', expect.any(String), {
            canOverride: false,
            ttlMs: 7000
        });
        expect(mocks.set).toHaveBeenNthCalledWith(2, 'attio:dedupe:2:3:workspace-1:object-1:record-1:fetch', expect.any(String), {
            canOverride: false,
            ttlMs: 7000
        });
        expect(mocks.set).toHaveBeenNthCalledWith(3, 'attio:dedupe:2:3:workspace-1:object-1:record-1:delete', expect.any(String), {
            canOverride: false,
            ttlMs: 7000
        });
        expect(mocks.set).toHaveBeenNthCalledWith(4, 'attio:dedupe:2:3:workspace-1:object-1:record-1:merged', expect.any(String), {
            canOverride: false,
            ttlMs: 7000
        });
        expect(nango.executeScriptForWebhooks).toHaveBeenCalledTimes(3);
        expect(nango.executeScriptForWebhooks).toHaveBeenCalledWith(expect.objectContaining({ delaySeconds: 7 }));
        expect(mocks.increment).toHaveBeenCalledWith('nango.webhook.dedupe.suppressed', 1, { provider: 'attio', enforced: 'true' });
    });

    it('skips dedupe for events without a record id', async () => {
        const nango = makeNango();
        const eventWithoutRecordId = event('record.updated');
        delete eventWithoutRecordId.id.record_id;
        const body = {
            webhook_id: 'webhook-1',
            events: [eventWithoutRecordId]
        } as AttioWebhook;

        await route(nango as never, {}, body, '');

        expect(mocks.set).not.toHaveBeenCalled();
        expect(nango.executeScriptForWebhooks).toHaveBeenCalledOnce();
    });

    it('runs in shadow mode until the account flag is enabled', async () => {
        mocks.isAttioWebhookDedupeEnabled.mockResolvedValue(false);
        mocks.set.mockRejectedValue(new Error('set_key_already_exists'));
        const nango = makeNango();

        await route(nango as never, {}, { webhook_id: 'webhook-1', events: [event('record.updated')] }, '');

        expect(mocks.set).toHaveBeenCalledWith('attio:dedupe:2:3:workspace-1:object-1:record-1:fetch:shadow', expect.any(String), {
            canOverride: false,
            ttlMs: 7000
        });
        expect(nango.executeScriptForWebhooks).toHaveBeenCalledOnce();
        expect(nango.executeScriptForWebhooks).toHaveBeenCalledWith(expect.not.objectContaining({ delaySeconds: expect.anything() }));
        expect(mocks.increment).toHaveBeenCalledWith('nango.webhook.dedupe.suppressed', 1, { provider: 'attio', enforced: 'false' });
    });

    it('preserves connection routing when an event is suppressed', async () => {
        mocks.set.mockRejectedValue(new Error('set_key_already_exists'));
        const nango = makeNango();

        const result = await route(nango as never, {}, { webhook_id: 'webhook-1', events: [event('record.updated')] }, '');

        expect(nango.executeScriptForWebhooks).not.toHaveBeenCalled();
        expect(mocks.findConnectionsByConnectionConfigValue).toHaveBeenCalledWith('workspace_id', 'workspace-1', 2, 3);
        expect(result.unwrap()).toEqual(expect.objectContaining({ connectionIds: ['conn-1'] }));
    });

    it('fails open when kvstore is unavailable', async () => {
        mocks.set.mockRejectedValue(new Error('redis unavailable'));
        const nango = makeNango();

        await route(nango as never, {}, { webhook_id: 'webhook-1', events: [event('record.updated')] }, '');

        expect(nango.executeScriptForWebhooks).toHaveBeenCalledOnce();
        expect(nango.executeScriptForWebhooks).toHaveBeenCalledWith(expect.not.objectContaining({ delaySeconds: expect.anything() }));
        expect(mocks.report).toHaveBeenCalledWith(expect.any(Error), {
            context: 'attio webhook dedupe claim failed',
            accountId: 1,
            environmentId: 2,
            integrationId: 3
        });
    });

    it('releases the claim when webhook dispatch throws', async () => {
        const nango = makeNango();
        nango.executeScriptForWebhooks.mockRejectedValue(new Error('dispatch failed'));

        await expect(route(nango as never, {}, { webhook_id: 'webhook-1', events: [event('record.updated')] }, '')).rejects.toThrow('dispatch failed');

        expect(mocks.deleteIfValueEquals).toHaveBeenCalledWith('attio:dedupe:2:3:workspace-1:object-1:record-1:fetch', expect.any(String));
    });
});
