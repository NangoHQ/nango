import { describe, expect, it } from 'vitest';
import { stringifyAndTruncateLog } from './utils.js';

describe('stringifyAndTruncateLog', () => {
    it('should not break a small string', () => {
        const str = stringifyAndTruncateLog(['hello']);
        expect(str).toStrictEqual('hello');
    });

    it('should limit a string', () => {
        const str = stringifyAndTruncateLog(['hello'], 2);
        expect(str).toStrictEqual('he... (truncated)');
    });

    it('should limit an object', () => {
        const str = stringifyAndTruncateLog(['hello', { foo: 'bar' }], 10);
        expect(str).toStrictEqual('hello {"fo... (truncated)');
    });

    it('should not break empty args', () => {
        const str = stringifyAndTruncateLog([]);
        expect(str).toStrictEqual('');
    });

    it('should handle object', () => {
        const str = stringifyAndTruncateLog([{ foo: 1 }]);
        expect(str).toStrictEqual(' {"foo":1}');
    });
    it('should handle object + string', () => {
        const str = stringifyAndTruncateLog(['hello', { foo: 1 }]);
        expect(str).toStrictEqual('hello {"foo":1}');
    });
});
