import { describe, expect, it, vi } from 'vitest';

import { deleteEach, formatDeleteError, throwIfDeleteErrors } from './delete.js';

describe(formatDeleteError, () => {
    it('uses the error message or a fallback', () => {
        expect(formatDeleteError('a.js', new Error('forbidden'))).toBe('a.js: forbidden');
        expect(formatDeleteError('a.js', 'denied')).toBe('a.js: denied');
        expect(formatDeleteError(undefined, '')).toBe('unknown: delete failed');
    });
});

describe(throwIfDeleteErrors, () => {
    it('no-ops when there are no errors and throws the shared message otherwise', () => {
        expect(() => throwIfDeleteErrors('GCS', [])).not.toThrow();
        expect(() => throwIfDeleteErrors('GCS', ['a.js: forbidden'])).toThrow('Failed to delete GCS objects: a.js: forbidden');
    });
});

describe(deleteEach, () => {
    it('deletes every key and reports all failures after attempting the rest', async () => {
        const deleted: string[] = [];
        const deleteOne = vi.fn((key: string) => {
            if (key === 'fail.js' || key === 'also-fail.js') {
                return Promise.reject(new Error('forbidden'));
            }
            deleted.push(key);
            return Promise.resolve();
        });

        await expect(deleteEach(['fail.js', 'ok.js', 'also-fail.js'], deleteOne, 'Azure')).rejects.toThrow(
            'Failed to delete Azure objects: fail.js: forbidden, also-fail.js: forbidden'
        );
        expect(deleted).toEqual(['ok.js']);
        expect(deleteOne).toHaveBeenCalledTimes(3);
    });
});
