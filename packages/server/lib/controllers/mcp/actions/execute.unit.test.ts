import { afterEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, pubsub, resolveLegacyAction } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { executeMcpAction } from './execute.js';

import type * as NangoShared from '@nangohq/shared';
import type { ResolvedLegacyAction } from '@nangohq/shared';

const mocks = vi.hoisted(() => ({ triggerAction: vi.fn<(input: { input: unknown }) => Promise<ReturnType<typeof Ok>>>() }));
vi.mock('../../../utils/utils.js', () => ({ getOrchestrator: () => ({ triggerAction: mocks.triggerAction }) }));
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
} as unknown as Extract<ResolvedLegacyAction, { kind: 'deployed' }>;

function setup() {
    vi.spyOn(connectionService, 'getConnection').mockResolvedValue({ success: true, response: { id: 1, provider_config_key: 'google-calendar' } } as never);
    const getIntegration = vi.spyOn(configService, 'getProviderConfig').mockResolvedValue({ id: 1, provider: 'google-calendar' } as never);
    vi.mocked(resolveLegacyAction).mockResolvedValue(action);
    const createLog = vi.spyOn(logContextGetter, 'create').mockResolvedValue({ attachSpan: vi.fn(), operation: {}, id: 'op' } as never);
    const publish = vi.spyOn(pubsub.publisher, 'publish').mockResolvedValue(undefined as never);
    mocks.triggerAction.mockResolvedValue(Ok({ data: { id: 'event' } }));
    const span = { setTag: vi.fn().mockReturnThis() };
    return {
        createLog,
        getIntegration,
        publish,
        run: (input: unknown, isAsync = false, resolvedAction?: Exclude<ResolvedLegacyAction, { kind: 'missing' }>) =>
            executeMcpAction({
                account: { id: 1, uuid: 'account' },
                environment: { id: 1, name: 'dev' },
                connectionId: 'connection',
                providerConfigKey: 'google-calendar',
                actionName: 'create-event',
                input,
                resolvedAction,
                isAsync,
                retryMax: 0,
                span
            } as unknown as Parameters<typeof executeMcpAction>[0])
    };
}

describe('executeMcpAction input validation', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it.each([false, true])('rejects encoded input before scheduling (async=%s)', async (isAsync) => {
        const { run, createLog, publish } = setup();
        const { result } = await run('{"calendarId":"primary"}', isAsync);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.code).toBe('invalid_input');
            expect(result.error.message).toContain('input must be object');
        }
        expect(mocks.triggerAction).not.toHaveBeenCalled();
        expect(createLog).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });

    it('validates an already-resolved MCP tool before making more lookups', async () => {
        const { run, getIntegration } = setup();
        const { result } = await run('{"calendarId":"primary"}', false, action);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) expect(result.error.code).toBe('invalid_input');
        expect(getIntegration).not.toHaveBeenCalled();
        expect(mocks.triggerAction).not.toHaveBeenCalled();
    });

    it('reports a broken MCP input schema as an internal failure without execution', async () => {
        const { run } = setup();
        const resolvedAction = { ...action, config: { ...action.config, id: 8406, models_json_schema: { definitions: {} } } };
        const { result } = await run({}, false, resolvedAction);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) expect(result.error.code).toBe('internal_error');
        expect(mocks.triggerAction).not.toHaveBeenCalled();
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
