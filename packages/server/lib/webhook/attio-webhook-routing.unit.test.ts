import { beforeEach, describe, expect, it, vi } from 'vitest';

import route from './attio-webhook-routing.js';

import type { AttioWebhook } from './types.js';

const mocks = vi.hoisted(() => ({
    dedupeWindowMs: 7000,
    isAttioWebhookDedupeEnabled: vi.fn()
}));

vi.mock('../env.js', () => ({
    envs: {
        get NANGO_WEBHOOK_DEDUPE_WINDOW_MS() {
            return mocks.dedupeWindowMs;
        }
    }
}));
vi.mock('@nangohq/feature-flags', () => ({
    getFlags: () => ({ isAttioWebhookDedupeEnabled: mocks.isAttioWebhookDedupeEnabled })
}));

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
        team: { uuid: 'account-uuid' },
        environment: { id: 2 },
        integration: { id: 3, custom: {} },
        executeScriptForWebhooks: vi.fn().mockResolvedValue({ connectionIds: ['conn-1'] })
    };
}

describe('Attio webhook routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.dedupeWindowMs = 7000;
        mocks.isAttioWebhookDedupeEnabled.mockResolvedValue(true);
    });

    it('dedupes record events by record and event class without the attribute id', async () => {
        const nango = makeNango();
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

        const dedupeOptions = nango.executeScriptForWebhooks.mock.calls.map(([options]) => options.dedupe);
        expect(dedupeOptions).toEqual([
            { key: 'attio:dedupe:2:3:workspace-1:object-1:record-1:fetch', ttlMs: 7000, enforce: true },
            { key: 'attio:dedupe:2:3:workspace-1:object-1:record-1:fetch', ttlMs: 7000, enforce: true },
            { key: 'attio:dedupe:2:3:workspace-1:object-1:record-1:delete', ttlMs: 7000, enforce: true },
            { key: 'attio:dedupe:2:3:workspace-1:object-1:record-1:merged', ttlMs: 7000, enforce: true }
        ]);
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

        expect(nango.executeScriptForWebhooks).toHaveBeenCalledWith(expect.not.objectContaining({ dedupe: expect.anything() }));
    });

    it('runs in shadow mode until the account flag is enabled', async () => {
        mocks.isAttioWebhookDedupeEnabled.mockResolvedValue(false);
        const nango = makeNango();

        await route(nango as never, {}, { webhook_id: 'webhook-1', events: [event('record.updated')] }, '');

        expect(nango.executeScriptForWebhooks).toHaveBeenCalledWith(
            expect.objectContaining({ dedupe: expect.objectContaining({ ttlMs: 7000, enforce: false }) })
        );
    });

    it('disables dedupe entirely when the window is zero', async () => {
        mocks.dedupeWindowMs = 0;
        const nango = makeNango();

        await route(nango as never, {}, { webhook_id: 'webhook-1', events: [event('record.updated')] }, '');

        expect(mocks.isAttioWebhookDedupeEnabled).not.toHaveBeenCalled();
        expect(nango.executeScriptForWebhooks).toHaveBeenCalledWith(expect.not.objectContaining({ dedupe: expect.anything() }));
    });
});
