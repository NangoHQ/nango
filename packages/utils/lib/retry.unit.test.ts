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
        } catch (err: any) {
            expect(err.message).toEqual('my error');
        }
        expect(count).toBe(3);
    });

    it('should not retry if result condition is false ', async () => {
        let count = 0;
        try {
            await retry(
                () => {
                    count++;
                    return count;
                },
                {
                    maxAttempts: 3,
                    delayMs: () => 0,
                    retryIf: (n) => n == -1
                }
            );
        } catch (err: any) {
            expect(err.message).toEqual('my error');
        }
        expect(count).toBe(1);
    });

    it('should not retry if error condition is false ', async () => {
        let count = 0;
        try {
            await retry(
                () => {
                    count++;
                    if (count < 3) {
                        throw new Error('my error');
                    }
                    return count;
                },
                {
                    maxAttempts: 3,
                    delayMs: () => 0,
                    retryOnError: (error) => error.message === 'another error'
                }
            );
        } catch (err: any) {
            expect(err.message).toEqual('my error');
        }
        expect(count).toBe(1);
    });
});
