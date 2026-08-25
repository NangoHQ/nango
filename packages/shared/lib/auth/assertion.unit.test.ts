import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { isJwtAssertionExpired, isSamlAssertionExpired } from './assertion.js';

const SAML_NAMESPACE = 'urn:oasis:names:tc:SAML:2.0:assertion';

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function makeSamlAssertion(notOnOrAfter: string): string {
    const xml = `<saml:Assertion xmlns:saml="${SAML_NAMESPACE}"><saml:Conditions NotBefore="2024-01-01T00:00:00Z" NotOnOrAfter="${notOnOrAfter}"/></saml:Assertion>`;
    return Buffer.from(xml).toString('base64');
}

describe('isJwtAssertionExpired', () => {
    it('returns true for a malformed token string', () => {
        expect(isJwtAssertionExpired('not-a-jwt')).toBe(true);
    });

    it('returns true for a token missing the exp claim', () => {
        const token = jwt.sign({ sub: 'test' }, 'secret');
        expect(isJwtAssertionExpired(token)).toBe(true);
    });

    it('returns true for an already expired token', () => {
        const token = jwt.sign({ exp: nowSeconds() - 3600 }, 'secret');
        expect(isJwtAssertionExpired(token)).toBe(true);
    });

    it('returns true for a token expiring within the 60-second refresh margin', () => {
        const token = jwt.sign({ exp: nowSeconds() + 30 }, 'secret');
        expect(isJwtAssertionExpired(token)).toBe(true);
    });

    it('returns false for a token with more than 60 seconds remaining', () => {
        const token = jwt.sign({ exp: nowSeconds() + 3600 }, 'secret');
        expect(isJwtAssertionExpired(token)).toBe(false);
    });
});

describe('isSamlAssertionExpired', () => {
    it('returns true for content that decodes to non-XML', () => {
        const notXml = Buffer.from('hello world').toString('base64');
        expect(isSamlAssertionExpired(notXml)).toBe(true);
    });

    it('returns true for XML missing the Conditions element', () => {
        const xml = `<saml:Assertion xmlns:saml="${SAML_NAMESPACE}"><saml:Issuer>test</saml:Issuer></saml:Assertion>`;
        expect(isSamlAssertionExpired(Buffer.from(xml).toString('base64'))).toBe(true);
    });

    it('returns true for a Conditions element with an unparseable NotOnOrAfter date', () => {
        const xml = `<saml:Assertion xmlns:saml="${SAML_NAMESPACE}"><saml:Conditions NotBefore="2024-01-01T00:00:00Z" NotOnOrAfter="not-a-date"/></saml:Assertion>`;
        expect(isSamlAssertionExpired(Buffer.from(xml).toString('base64'))).toBe(true);
    });

    it('returns true for a Conditions element missing the NotOnOrAfter attribute', () => {
        const xml = `<saml:Assertion xmlns:saml="${SAML_NAMESPACE}"><saml:Conditions NotBefore="2024-01-01T00:00:00Z"/></saml:Assertion>`;
        expect(isSamlAssertionExpired(Buffer.from(xml).toString('base64'))).toBe(true);
    });

    it('returns true for an already expired assertion', () => {
        const notOnOrAfter = new Date((nowSeconds() - 3600) * 1000).toISOString();
        expect(isSamlAssertionExpired(makeSamlAssertion(notOnOrAfter))).toBe(true);
    });

    it('returns true for an assertion expiring within the 60-second refresh margin', () => {
        const notOnOrAfter = new Date((nowSeconds() + 30) * 1000).toISOString();
        expect(isSamlAssertionExpired(makeSamlAssertion(notOnOrAfter))).toBe(true);
    });

    it('returns false for an assertion with more than 60 seconds remaining', () => {
        const notOnOrAfter = new Date((nowSeconds() + 3600) * 1000).toISOString();
        expect(isSamlAssertionExpired(makeSamlAssertion(notOnOrAfter))).toBe(false);
    });
});
