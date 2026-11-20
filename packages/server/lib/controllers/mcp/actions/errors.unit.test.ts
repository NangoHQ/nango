import { describe, expect, it } from 'vitest';

import { NangoError } from '@nangohq/shared';

import { ActionExecutionError } from '../../../services/action.service.js';
import { PublicMcpError } from '../utils.js';
import { actionExecutionErrorToMcp } from './errors.js';

describe('actionExecutionErrorToMcp', () => {
    it.each([
        { payload: { error: { message: 'Missing timeMin parameter.' } }, detail: ': Missing timeMin parameter.' },
        { payload: { error: { message: 'x'.repeat(600) } }, detail: `: ${'x'.repeat(500)}` },
        { payload: { request: { authorization: 'secret' } }, detail: '' }
    ])('includes bounded provider failure details: $detail', ({ payload, detail }) => {
        const nangoError = new NangoError('script_http_error', payload);

        const error = actionExecutionErrorToMcp(new ActionExecutionError({ code: 'action_failed', message: nangoError.message, nangoError }));

        expect(error).toBeInstanceOf(PublicMcpError);
        expect(error.message).toBe(`${nangoError.message}${detail}`);
    });

    it('returns the original failure message when no underlying error is available', () => {
        const error = actionExecutionErrorToMcp(new ActionExecutionError({ code: 'action_failed', message: 'Action failed' }));

        expect(error).toBeInstanceOf(PublicMcpError);
        expect(error.message).toBe('Action failed');
    });
});
