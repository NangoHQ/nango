import { describe, expect, it } from 'vitest';
import { redactHeaders } from './http.js';

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
});
