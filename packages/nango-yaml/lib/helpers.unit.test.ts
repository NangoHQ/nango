import { expect, describe, it } from 'vitest';
import { getInterval, isJsOrTsType } from './helpers.js';

describe('Nango Config Interval tests', () => {
    it('throws error when interval is less than 30 seconds', () => {
        const interval = getInterval('every 20s', new Date());
        expect(interval).toStrictEqual(new Error('sync_interval_too_short'));
    });

    it('Can parse every half day', () => {
        const date = new Date('2023-07-18T00:00:00');
        const interval = getInterval('every half day', date);
        expect(interval).toEqual({ interval: '12h', offset: 0 });

        const tenMinutes = new Date('2023-07-18T00:10:00');
        const interval2 = getInterval('every half day', tenMinutes);
        expect(interval2).toEqual({ interval: '12h', offset: 600000 });
    });

    it('Can parse every 1.5 hours', () => {
        const date = new Date('2023-07-18T00:00:00');
        const interval = getInterval('every 1.5 hours', date);
        expect(interval).toEqual({ interval: '1.5 hours', offset: 0 });
    });

    it('Can parse every day', () => {
        const date = new Date('2023-07-18T00:00:00');
        const interval = getInterval('every day', date);
        expect(interval).toEqual({ interval: '1d', offset: 0 });
    });

    it('Can parse every 5 minutes', () => {
        const date = new Date('2023-07-18T00:00:00');
        const interval = getInterval('every 5m', date);
        expect(interval).toEqual({ interval: '5m', offset: 0 });
    });

    it('Can parse every 10 minutes', () => {
        const date = new Date('2023-07-18T00:00:00');
        const interval = getInterval('every 10m', date);
        expect(interval).toEqual({ interval: '10m', offset: 0 });
    });

    it('Can parse every week', () => {
        const date = new Date('2023-07-18T00:00:00');
        const interval = getInterval('every week', date);
        expect(interval).toEqual({ interval: '1w', offset: 0 });
    });

    it('Can parse every month', () => {
        const date = new Date('2023-07-18T00:00:00');
        const interval = getInterval('every month', date);
        expect(interval).toEqual({ interval: '30d', offset: 0 });
    });

    it('Returns error for unsupported interval format', () => {
        const date = new Date('2023-07-18T00:00:00');
        const interval = getInterval('every yearasdad', date);
        expect(interval).toStrictEqual(new Error('sync_interval_invalid'));
    });

    it('Can parse intervals with different starting offset', () => {
        const date = new Date('2023-07-18T12:30:00');
        const interval = getInterval('every 1h', date);
        expect(interval).toEqual({ interval: '1h', offset: 1800000 });
    });

    it('Gives back a correct offset', () => {
        const date = new Date('2023-07-18T12:30:00');
        const interval = getInterval('every 1h', date);
        expect(interval).toEqual({ interval: '1h', offset: 1800000 });
    });

    it('Gives back a correct offset with 5 after with an interval of 30 minutes', () => {
        const date = new Date('2023-07-18T12:35:00');
        const interval = getInterval('every 30m', date);
        expect(interval).toEqual({ interval: '30m', offset: 300000 }); // 300000 is 5 minutes
    });
});

describe('isJsOrTsType ', () => {
    it('recognizes primitive types', () => {
        expect(isJsOrTsType('string')).toBe(true);
        expect(isJsOrTsType('number')).toBe(true);
        expect(isJsOrTsType('boolean')).toBe(true);
    });

    it('recognizes function types', () => {
        expect(isJsOrTsType('Function')).toBe(true);
    });

    it('recognizes symbol types', () => {
        expect(isJsOrTsType('Symbol')).toBe(true);
        expect(isJsOrTsType('symbol')).toBe(true);
    });

    it('recognizes object types', () => {
        expect(isJsOrTsType('object')).toBe(true);
        expect(isJsOrTsType('Object')).toBe(true);
    });

    it('recognizes array types', () => {
        expect(isJsOrTsType('Array')).toBe(true);
        expect(isJsOrTsType('Array<string>')).toBe(true);
        expect(isJsOrTsType('Array<number>')).toBe(true);
        expect(isJsOrTsType('Array<boolean>')).toBe(true);
    });

    it('recognizes primitive alias types', () => {
        expect(isJsOrTsType('String')).toBe(true);
        expect(isJsOrTsType('Number')).toBe(true);
        expect(isJsOrTsType('Boolean')).toBe(true);
    });

    it('recognizes built-in object types', () => {
        expect(isJsOrTsType('Object')).toBe(true);
        expect(isJsOrTsType('Array')).toBe(true);
        expect(isJsOrTsType('Date')).toBe(true);
    });

    it('recognizes utility types', () => {
        expect(isJsOrTsType('Record')).toBe(true);
        expect(isJsOrTsType('Partial')).toBe(true);
        expect(isJsOrTsType('Readonly')).toBe(true);
    });

    it('handles array shorthand notation', () => {
        expect(isJsOrTsType('string[]')).toBe(true);
        expect(isJsOrTsType('number[]')).toBe(true);
        expect(isJsOrTsType('Array<string>')).toBe(true); // Testing generic array type
    });

    it('handles generic types', () => {
        expect(isJsOrTsType('Map<string, number>')).toBe(true);
        expect(isJsOrTsType('Set<boolean>')).toBe(true);
        expect(isJsOrTsType('Promise<Date>')).toBe(true);
    });

    it('returns false for unrecognized types', () => {
        expect(isJsOrTsType('UnrecognizedType')).toBe(false);
        expect(isJsOrTsType('AnotherType')).toBe(false);
        expect(isJsOrTsType('string{}')).toBe(false); // Invalid syntax
    });

    it('recognizes shorthand array types', () => {
        expect(isJsOrTsType('string[]')).toBe(true);
        expect(isJsOrTsType('number[]')).toBe(true);
        expect(isJsOrTsType('boolean[]')).toBe(true);
        expect(isJsOrTsType('Map<string, string>[]')).toBe(true);
        expect(isJsOrTsType('Set<number>[]')).toBe(true);
        expect(isJsOrTsType('Promise<boolean>[]')).toBe(true);
        expect(isJsOrTsType('Map<Person>[]')).toBe(true);
    });
});
