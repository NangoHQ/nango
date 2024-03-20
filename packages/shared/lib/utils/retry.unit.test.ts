import { expect, describe, it } from 'vitest';
import { retry } from './retry.js';

describe('retry', () => {
    it('should retry', async () => {
        let count = 0;
        const result = await retry(
            () => {
                count++;
                if (count < 3) {
                    throw new Error('my error');
                }
                return count;
            },
            {
                maxAttempts: 3,
                delayMs: () => 0
            }
        );
        expect(result).toEqual(3);
    });

    it('should throw error after max attempts', async () => {
        let count = 0;
        try {
            await retry(
                () => {
                    count++;
                    throw new Error('my error');
                },
                {
                    maxAttempts: 3,
                    delayMs: () => 0
                }
            );
        } catch (error: any) {
            expect(error.message).toEqual('my error');
        }
        expect(count).toBe(3);
    });
});
