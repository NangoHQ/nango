import { describe, expect, it, vi } from 'vitest';

import { envs } from '../../../env.js';
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

    it('still attempts later keys when creating a delete request throws synchronously', async () => {
        const attempted: string[] = [];
        const deleteOne = vi.fn((key: string) => {
            attempted.push(key);
            if (key === 'fail.js') {
                throw new Error('cannot start request');
            }
            return Promise.resolve();
        });

        await expect(deleteEach(['fail.js', 'ok.js'], deleteOne, 'GCS')).rejects.toThrow('Failed to delete GCS objects: fail.js: cannot start request');
        expect(attempted).toEqual(['fail.js', 'ok.js']);
    });

    it('caps in-flight deletes', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        const keys = Array.from({ length: envs.OBJECT_STORE_DELETE_CONCURRENCY + 8 }, (_, i) => `${i}.js`);

        await deleteEach(
            keys,
            async () => {
                inFlight++;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await Promise.resolve();
                inFlight--;
            },
            'GCS'
        );

        expect(maxInFlight).toBe(envs.OBJECT_STORE_DELETE_CONCURRENCY);
    });
});
