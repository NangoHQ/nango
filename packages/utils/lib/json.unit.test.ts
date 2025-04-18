import { describe, expect, it } from 'vitest';
import { stringifyAndTruncateValue } from './json.js';

describe('stringifyAndTruncateValue', () => {
    it('should not break a small string', () => {
        const str = stringifyAndTruncateValue('hello');
        expect(str).toStrictEqual('hello');
    });

    it('should limit a string', () => {
        const str = stringifyAndTruncateValue('hello', 2);
        expect(str).toStrictEqual('he... (truncated)');
    });

    it('should limit a string with multi-bytes characters', () => {
        const str = stringifyAndTruncateValue('👋👋👋', 7); // 4 bytes each
        expect(str).toStrictEqual('👋... (truncated)'); // 7 bytes limit is not enough for 2 characters => truncating after the first one
    });

    it('should limit an object', () => {
        const str = stringifyAndTruncateValue({ foo: 'bar' }, 10);
        expect(str).toStrictEqual('{}');
    });

    it('should handle undefined', () => {
        const str = stringifyAndTruncateValue(undefined);
        expect(str).toStrictEqual('undefined');
    });

    it('should handle null', () => {
        const str = stringifyAndTruncateValue(null);
        expect(str).toStrictEqual('null');
    });

    it('should handle object', () => {
        const str = stringifyAndTruncateValue({ foo: 1 });
        expect(str).toStrictEqual('{"foo":1}');
    });

    it('should handle array', () => {
        const str = stringifyAndTruncateValue([{ foo: 1 }, 2]);
        expect(str).toStrictEqual('[{"foo":1},2]');
    });

    it('should handle circular', () => {
        const obj: Record<string, any> = { foo: 'bar' };
        obj['circular'] = obj;
        const str = stringifyAndTruncateValue(obj);
        expect(str).toStrictEqual('{"circular":"[Circular]","foo":"bar"}');
    });

    it('should redac known keys', () => {
        const obj: Record<string, any> = { Authorization: 'super secret key' };
        const str = stringifyAndTruncateValue(obj);
        expect(str).toStrictEqual('{"Authorization":"[Redacted]"}');
    });
});
