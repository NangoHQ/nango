import { describe, expect, it } from 'vitest';

import { buildConnectUiSessionLink, connectUrlAsDocumentBase } from './connect-ui.js';

describe('connectUrlAsDocumentBase', () => {
    it('should keep a root URL as-is', () => {
        expect(connectUrlAsDocumentBase('http://localhost:3009').toString()).toBe('http://localhost:3009/');
    });

    it('should add the trailing slash to a sub-path URL', () => {
        expect(connectUrlAsDocumentBase('https://example.com/nango/connect').toString()).toBe('https://example.com/nango/connect/');
    });

    it('should be idempotent for a sub-path URL that already ends with a slash', () => {
        expect(connectUrlAsDocumentBase('https://example.com/nango/connect/').toString()).toBe('https://example.com/nango/connect/');
    });
});

describe('buildConnectUiSessionLink', () => {
    it('should build a root link', () => {
        expect(buildConnectUiSessionLink('t', 'http://localhost:3009')).toBe('http://localhost:3009/?session_token=t');
    });

    it('should add the trailing slash to a sub-path URL', () => {
        expect(buildConnectUiSessionLink('t', 'https://example.com/nango/connect')).toBe('https://example.com/nango/connect/?session_token=t');
    });

    it('should be idempotent for a sub-path URL that already ends with a slash', () => {
        expect(buildConnectUiSessionLink('t', 'https://example.com/nango/connect/')).toBe('https://example.com/nango/connect/?session_token=t');
    });

    it('should URL-encode the token', () => {
        expect(buildConnectUiSessionLink('a b&c', 'http://localhost:3009')).toBe('http://localhost:3009/?session_token=a+b%26c');
    });
});
