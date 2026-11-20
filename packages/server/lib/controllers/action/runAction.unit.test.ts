import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err } from '@nangohq/utils';

import { ActionExecutionError, executeAction } from '../../services/action.service.js';
import { runAction } from './runAction.js';

import type * as ActionService from '../../services/action.service.js';

vi.mock('../../services/action.service.js', async (importOriginal) => {
    const actual = await importOriginal<typeof ActionService>();
    return { ...actual, executeAction: vi.fn() };
});

describe('runAction', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('returns invalid action input as HTTP 400 with a useful message', async () => {
        vi.mocked(executeAction).mockResolvedValue({
            logCtx: undefined,
            result: Err(new ActionExecutionError({ code: 'invalid_input', message: 'Invalid input: input must be object' }))
        });
        const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
        await runAction({
            account: {},
            environment: {},
            connectionId: 'connection',
            providerConfigKey: 'google-calendar',
            actionName: 'create-event',
            input: '{"calendarId":"primary"}',
            isAsync: false,
            retryMax: 0,
            res,
            span: {}
        } as unknown as Parameters<typeof runAction>[0]);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith({ error: { code: 'invalid_input', message: 'Invalid input: input must be object' } });
    });
});
