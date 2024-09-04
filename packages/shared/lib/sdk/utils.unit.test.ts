import { describe, expect, it } from 'vitest';
import { stringifyAndTruncateLog } from './utils.js';

describe('stringifyAndTruncateLog', () => {
    it('should not break a small string', () => {
        const str = stringifyAndTruncateLog('hello');
        expect(str).toStrictEqual('hello');
    });

    it('should limit a string', () => {
        const str = stringifyAndTruncateLog('hello', 2);
        expect(str).toStrictEqual('he... (truncated)');
    });

    it('should limit an object', () => {
        const str = stringifyAndTruncateLog({ foo: 'bar' }, 10);
        expect(str).toStrictEqual('{"foo":"ba... (truncated)');
    });

    it('should handle undefined', () => {
        const str = stringifyAndTruncateLog(undefined);
        expect(str).toStrictEqual('undefined');
    });

    it('should handle null', () => {
        const str = stringifyAndTruncateLog(null);
        expect(str).toStrictEqual('null');
    });

    it('should handle object', () => {
        const str = stringifyAndTruncateLog({ foo: 1 });
        expect(str).toStrictEqual('{"foo":1}');
    });
    it('should handle array', () => {
        const str = stringifyAndTruncateLog([{ foo: 1 }, 2]);
        expect(str).toStrictEqual('[{"foo":1},2]');
    });
});
