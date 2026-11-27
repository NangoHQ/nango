import { afterEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, pubsub, resolveLegacyAction } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { executeAction } from './action.service.js';

import type * as NangoShared from '@nangohq/shared';
import type { ResolvedLegacyAction } from '@nangohq/shared';

const mocks = vi.hoisted(() => ({ triggerAction: vi.fn<(input: { input: unknown }) => Promise<ReturnType<typeof Ok>>>() }));
vi.mock('../utils/utils.js', () => ({ getOrchestrator: () => ({ triggerAction: mocks.triggerAction }) }));
vi.mock('@nangohq/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof NangoShared>();
    return { ...actual, resolveLegacyAction: vi.fn() };
});

const action = {
    kind: 'deployed',
    config: {
        id: 8405,
        version: '1',
        input: 'Input',
        models_json_schema: {
            definitions: { Input: { type: 'object', properties: { calendarId: { type: 'string' } }, required: ['calendarId'] } }
        },
        enabled: true,
        source: 'repo',
        sync_name: 'create-event'
    }
} as unknown as ResolvedLegacyAction;

function setup() {
    vi.spyOn(connectionService, 'getConnection').mockResolvedValue({ success: true, response: { id: 1, provider_config_key: 'google-calendar' } } as never);
    vi.spyOn(configService, 'getProviderConfig').mockResolvedValue({ id: 1, provider: 'google-calendar' } as never);
    vi.mocked(resolveLegacyAction).mockResolvedValue(action);
    const createLog = vi.spyOn(logContextGetter, 'create').mockResolvedValue({ attachSpan: vi.fn(), operation: {}, id: 'op' } as never);
    const publish = vi.spyOn(pubsub.publisher, 'publish').mockResolvedValue(undefined as never);
    mocks.triggerAction.mockResolvedValue(Ok({ data: { id: 'event' } }));
    const span = { setTag: vi.fn().mockReturnThis() };
    return {
        createLog,
        publish,
        run: (input: unknown, isAsync = false) =>
            executeAction({
                account: { id: 1, uuid: 'account' },
                environment: { id: 1, name: 'dev' },
                connectionId: 'connection',
                providerConfigKey: 'google-calendar',
                actionName: 'create-event',
                input,
                isAsync,
                retryMax: 0,
                span
            } as unknown as Parameters<typeof executeAction>[0])
    };
}

describe('executeAction legacy input compatibility', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it.each(['{"calendarId":"primary"}', {}, { calendarId: 123 }])('passes legacy input through without schema validation: %j', async (input) => {
        const { run } = setup();
        const { result } = await run(input);
        expect(result.isOk()).toBe(true);
        expect(mocks.triggerAction).toHaveBeenCalledWith(expect.objectContaining({ input }));
        expect(mocks.triggerAction.mock.calls[0]?.[0].input).toBe(input);
    });

    it('passes valid input to the orchestrator unchanged', async () => {
        const { run } = setup();
        const input = { calendarId: 'primary' };
        const { result } = await run(input);
        expect(result.isOk()).toBe(true);
        expect(mocks.triggerAction).toHaveBeenCalledWith(expect.objectContaining({ input }));
        expect(mocks.triggerAction.mock.calls[0]?.[0].input).toBe(input);
    });
});
