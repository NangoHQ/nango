import { describe, expect, it } from 'vitest';

import { normalizeFieldValue } from './utils';

import type { SimplifiedJSONSchema } from '@nangohq/types';

const field = (over: Partial<SimplifiedJSONSchema> = {}): SimplifiedJSONSchema => ({
    type: 'string',
    title: 'Hostname',
    description: '',
    order: 0,
    automated: false,
    prefix: 'https://',
    normalize: 'hostname',
    ...over
});

describe('normalizeFieldValue', () => {
    it('leaves a bare host untouched', () => {
        expect(normalizeFieldValue('acme.my.salesforce.com', field())).toBe('acme.my.salesforce.com');
    });

    it.each([
        ['https://acme.my.salesforce.com', 'acme.my.salesforce.com'],
        ['http://acme.my.salesforce.com', 'acme.my.salesforce.com'],
        ['HTTPS://acme.my.salesforce.com', 'acme.my.salesforce.com'],
        ['//acme.my.salesforce.com', 'acme.my.salesforce.com'],
        ['acme.my.salesforce.com/', 'acme.my.salesforce.com'],
        ['https://acme.my.salesforce.com/', 'acme.my.salesforce.com'],
        ['  https://acme.my.salesforce.com/  ', 'acme.my.salesforce.com'],
        ['https://acme.my.salesforce.com///', 'acme.my.salesforce.com']
    ])('reduces %j to %j', (input, expected) => {
        expect(normalizeFieldValue(input, field())).toBe(expected);
    });

    it('keeps a port', () => {
        expect(normalizeFieldValue('https://acme.com:8443', field())).toBe('acme.com:8443');
    });

    it('keeps an internal path', () => {
        expect(normalizeFieldValue('https://dev.azure.com/myorg', field())).toBe('dev.azure.com/myorg');
        expect(normalizeFieldValue('https://api.workos.com/scim/v2.0/acme', field())).toBe('api.workos.com/scim/v2.0/acme');
        expect(normalizeFieldValue('https://yourcompany.com:8000/ADOXX', field())).toBe('yourcompany.com:8000/ADOXX');
    });

    it('is a no-op without the opt-in', () => {
        expect(normalizeFieldValue('https://acme.com/', field({ normalize: undefined }))).toBe('https://acme.com/');
    });

    it('is a no-op without a schema', () => {
        expect(normalizeFieldValue('https://acme.com/', undefined)).toBe('https://acme.com/');
    });

    it('is a no-op without a prefix', () => {
        expect(normalizeFieldValue('https://acme.com/', field({ prefix: undefined }))).toBe('https://acme.com/');
    });

    it('is a no-op when the prefix is a host affix rather than a scheme', () => {
        expect(normalizeFieldValue('https://acme.com/', field({ prefix: 'auth.' }))).toBe('https://acme.com/');
        expect(normalizeFieldValue('acme.com/', field({ prefix: 'https://rest.' }))).toBe('acme.com/');
        expect(normalizeFieldValue('acme.com/', field({ prefix: 'https://cognito-' }))).toBe('acme.com/');
    });

    it('preserves an empty value', () => {
        expect(normalizeFieldValue('', field())).toBe('');
    });

    it('is idempotent', () => {
        const once = normalizeFieldValue('https://acme.my.salesforce.com/', field());
        expect(normalizeFieldValue(once, field())).toBe(once);
    });
});
