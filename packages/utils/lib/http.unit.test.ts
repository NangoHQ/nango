import { describe, expect, it } from 'vitest';

import { redactHeaders, redactURL } from './http.js';

describe('redactHeaders', () => {
    it('should not do anything if empty', () => {
        expect(redactHeaders()).toStrictEqual({});
    });

    it('should not do anything if not matching', () => {
        expect(redactHeaders({ headers: { MyHeader: 'hello' } })).toStrictEqual({ myheader: 'hello' });
    });

    it('should remove Authorization by default', () => {
        expect(redactHeaders({ headers: { Authorization: 'hello' } })).toStrictEqual({ authorization: 'REDACTED' });
    });

    it('should remove others headers', () => {
        expect(redactHeaders({ headers: { Authorization: 'hello', 'Sensitive-Token': 'foobar' }, headersToFilter: ['Sensitive-Token'] })).toStrictEqual({
            authorization: 'REDACTED',
            'sensitive-token': 'REDACTED'
        });
    });

    it('should remove by values', () => {
        expect(redactHeaders({ headers: { Authorization: 'hello', 'Sensitive-Token': 'foobar' }, valuesToFilter: ['foobar'] })).toStrictEqual({
            authorization: 'REDACTED',
            'sensitive-token': 'REDACTED'
        });
    });

    it('should remove ignored headers', () => {
        expect(
            redactHeaders({
                headers: { Authorization: 'hello', 'access-control-allow-headers': 'foobar', 'x-hubspot-correlation-id': 'test', 'x-not-filtered': 'hello' }
            })
        ).toStrictEqual({
            authorization: 'REDACTED',
            'x-not-filtered': 'hello'
        });
    });

    it('should not try to redact empty secret', () => {
        expect(
            redactHeaders({
                headers: { test: 'test' },
                valuesToFilter: ['']
            })
        ).toStrictEqual({
            test: 'test'
        });
    });
});

describe('redactURL', () => {
    it('should redact the url', () => {
        expect(redactURL({ url: 'https://example.com/test?apiKey=foobar', valuesToFilter: ['foobar'] })).toBe('https://example.com/test?apiKey=REDACTED');
    });

    it('should not redact the url if no values to filter', () => {
        expect(redactURL({ url: 'https://example.com/test', valuesToFilter: [] })).toBe('https://example.com/test');
    });

    it('should not try to redact empty secret', () => {
        expect(redactURL({ url: 'https://example.com/test', valuesToFilter: [''] })).toBe('https://example.com/test');
    });
});
