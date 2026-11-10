import { describe, expect, it, vi } from 'vitest';

import { sendUploadError } from './errors.js';

import type { UploadApiErrorCode } from './errors.js';
import type { ApiError } from '@nangohq/types';
import type { Response } from 'express';

describe('sendUploadError', () => {
    it.each([
        ['invalid_row', 400],
        ['installation_mismatch', 403],
        ['too_many_rows', 413],
        ['insert_failed', 500],
        ['a_code_nobody_mapped', 500]
    ])('answers %s with a %i', (code, expected) => {
        const status = vi.fn(() => ({ json: vi.fn() }));

        sendUploadError({ status } as unknown as Response<ApiError<UploadApiErrorCode>>, code as UploadApiErrorCode, 'why');

        expect(status).toHaveBeenCalledExactlyOnceWith(expected);
    });
});
