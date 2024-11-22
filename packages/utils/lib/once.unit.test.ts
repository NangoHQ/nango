import { once } from './once.js';
import { describe, expect, it, vi } from 'vitest';

describe('once', () => {
    it('should handle sync functions', () => {
        const mockFn = vi.fn();
        const onceFn = once(mockFn);

        onceFn();
        onceFn();
        onceFn();

        expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should handle async functions', async () => {
        const mockAsyncFn = vi.fn().mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
        const onceFn = once(mockAsyncFn);

        await onceFn();
        await onceFn();
        await onceFn();

        expect(mockAsyncFn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments correctly', () => {
        const mockFn = vi.fn();
        const onceFn = once(mockFn);

        onceFn('first', 123);
        onceFn('ignored', 456);

        expect(mockFn).toHaveBeenCalledTimes(1);
        expect(mockFn).toHaveBeenCalledWith('first', 123);
    });

    it('should memoize the result', async () => {
        const mockFn = vi.fn().mockImplementation((n: number) => {
            return n;
        });
        const onceFn = once(mockFn);

        const res1 = await onceFn(1);
        const res2 = await onceFn(2);
        const res3 = await onceFn(3);

        expect(res1).toStrictEqual(1);
        expect(res2).toStrictEqual(1);
        expect(res3).toStrictEqual(1);
        expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should handle errors', async () => {
        const mockFn = vi.fn().mockRejectedValue(new Error('myerror'));
        const onceFn = once(mockFn);

        await expect(onceFn()).rejects.toThrow('myerror');
        await expect(onceFn()).rejects.toThrow('myerror');
        await expect(onceFn()).rejects.toThrow('myerror');
        expect(mockFn).toHaveBeenCalledTimes(1);
    });
});
