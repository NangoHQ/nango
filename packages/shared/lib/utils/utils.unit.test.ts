import { expect, describe, it } from 'vitest';
import * as utils from './utils.js';

describe('Proxy service Construct Header Tests', () => {
    it('Should correctly return true if the url is valid', () => {
        const isValid = utils.isValidHttpUrl('https://www.google.com');

        expect(isValid).toBe(true);

        expect(utils.isValidHttpUrl('https://samcarthelp.freshdesk.com/api/v2/tickets?per_page=100&include=requester,description&page=3')).toBe(true);

        expect(utils.isValidHttpUrl('/api/v2/tickets?per_page=100&include=requester,description&page=3')).toBe(false);
    });
});

describe('utils.isJsOrTsType function tests', () => {
    it('recognizes primitive types', () => {
        expect(utils.isJsOrTsType('string')).toBe(true);
        expect(utils.isJsOrTsType('number')).toBe(true);
        expect(utils.isJsOrTsType('boolean')).toBe(true);
    });

    it('recognizes null and undefined', () => {
        expect(utils.isJsOrTsType('null')).toBe(true);
        expect(utils.isJsOrTsType('undefined')).toBe(true);
    });

    it('recognizes function types', () => {
        expect(utils.isJsOrTsType('Function')).toBe(true);
    });

    it('recognizes symbol types', () => {
        expect(utils.isJsOrTsType('Symbol')).toBe(true);
        expect(utils.isJsOrTsType('symbol')).toBe(true);
    });

    it('recognizes object types', () => {
        expect(utils.isJsOrTsType('object')).toBe(true);
        expect(utils.isJsOrTsType('Object')).toBe(true);
    });

    it('recognizes array types', () => {
        expect(utils.isJsOrTsType('Array')).toBe(true);
        expect(utils.isJsOrTsType('Array<string>')).toBe(true);
        expect(utils.isJsOrTsType('Array<number>')).toBe(true);
        expect(utils.isJsOrTsType('Array<boolean>')).toBe(true);
    });

    it('recognizes primitive alias types', () => {
        expect(utils.isJsOrTsType('String')).toBe(true);
        expect(utils.isJsOrTsType('Number')).toBe(true);
        expect(utils.isJsOrTsType('Boolean')).toBe(true);
        expect(utils.isJsOrTsType('integer')).toBe(true);
        expect(utils.isJsOrTsType('int')).toBe(true);
        expect(utils.isJsOrTsType('bool')).toBe(true);
        expect(utils.isJsOrTsType('char')).toBe(true);
    });

    it('recognizes built-in object types', () => {
        expect(utils.isJsOrTsType('Object')).toBe(true);
        expect(utils.isJsOrTsType('Array')).toBe(true);
        expect(utils.isJsOrTsType('Date')).toBe(true);
    });

    it('recognizes utility types', () => {
        expect(utils.isJsOrTsType('Record')).toBe(true);
        expect(utils.isJsOrTsType('Partial')).toBe(true);
        expect(utils.isJsOrTsType('Readonly')).toBe(true);
    });

    it('handles array shorthand notation', () => {
        expect(utils.isJsOrTsType('string[]')).toBe(true);
        expect(utils.isJsOrTsType('number[]')).toBe(true);
        expect(utils.isJsOrTsType('Array<string>')).toBe(true); // Testing generic array type
    });

    it('handles generic types', () => {
        expect(utils.isJsOrTsType('Map<string, number>')).toBe(true);
        expect(utils.isJsOrTsType('Set<boolean>')).toBe(true);
        expect(utils.isJsOrTsType('Promise<Date>')).toBe(true);
    });

    it('returns false for unrecognized types', () => {
        expect(utils.isJsOrTsType('UnrecognizedType')).toBe(false);
        expect(utils.isJsOrTsType('AnotherType')).toBe(false);
        expect(utils.isJsOrTsType('string{}')).toBe(false); // Invalid syntax
    });

    it('recognizes array types', () => {
        expect(utils.isJsOrTsType('string[]')).toBe(true);
        expect(utils.isJsOrTsType('number[]')).toBe(true);
        expect(utils.isJsOrTsType('boolean[]')).toBe(true);
        expect(utils.isJsOrTsType('bool[]')).toBe(true);
        expect(utils.isJsOrTsType('Map<string, string>[]')).toBe(true);
        expect(utils.isJsOrTsType('Set<number>[]')).toBe(true);
        expect(utils.isJsOrTsType('Promise<boolean>[]')).toBe(true);
        expect(utils.isJsOrTsType('Map<Person>[]')).toBe(true);
    });
});
