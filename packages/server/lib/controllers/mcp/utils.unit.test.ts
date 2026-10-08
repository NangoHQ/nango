import { describe, expect, it } from 'vitest';

import { NangoError } from '@nangohq/shared';

import { safeFailureDetail } from './utils.js';

describe('safeFailureDetail', () => {
    it('falls back to top-level payload.type and payload.message when payload.error is absent', () => {
        const error = new NangoError('action_script_runtime_error', { type: 'slack_error', message: 'channel_not_found', channel_id: 'C123' });

        expect(safeFailureDetail(error)).toBe('The action script failed with a runtime error: slack_error: channel_not_found');
    });

    it('falls back to payload.message alone when payload.type is missing', () => {
        const error = new NangoError('action_script_runtime_error', { message: 'channel_not_found' });

        expect(safeFailureDetail(error)).toBe('The action script failed with a runtime error: channel_not_found');
    });

    it('prefers payload.error over payload.message when both are present', () => {
        const error = new NangoError('action_script_runtime_error', { error: 'explicit error', message: 'ignored' });

        expect(safeFailureDetail(error)).toBe('The action script failed with a runtime error: explicit error');
    });

    it('prefers payload.error.message over top-level payload.message when both are present', () => {
        const error = new NangoError('action_script_runtime_error', { error: { message: 'nested error' }, message: 'ignored' });

        expect(safeFailureDetail(error)).toBe('The action script failed with a runtime error: nested error');
    });

    it('returns the generic message when the payload has no usable reason', () => {
        const error = new NangoError('action_script_runtime_error', { channel_id: 'C123' });

        expect(safeFailureDetail(error)).toBe('The action script failed with a runtime error');
    });
});
