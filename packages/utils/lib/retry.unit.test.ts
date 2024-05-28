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
                delayMs: () => 0,
                retryIf: () => true
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
                    delayMs: () => 0,
                    retryIf: () => true
                }
            );
        } catch (error: any) {
            expect(error.message).toEqual('my error');
        }
        expect(count).toBe(3);
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
                    retryIf: (error) => error.message === 'another error'
                }
            );
        } catch (error: any) {
            expect(error.message).toEqual('my error');
        }
        expect(count).toBe(1);
    });
});
