import { describe, expect, it } from 'vitest';

import { buildConnectUiSessionLink, connectUrlAsDocumentBase } from './connect-ui.js';

describe('connectUrlAsDocumentBase', () => {
    it('should keep a root URL as-is', () => {
        expect(connectUrlAsDocumentBase('http://localhost:3009').toString()).toBe('http://localhost:3009/');
    });

    it('should append a trailing slash to a sub-path', () => {
        expect(connectUrlAsDocumentBase('https://example.com/nango/connect').toString()).toBe('https://example.com/nango/connect/');
    });

    it('should be idempotent when the sub-path already ends with a slash', () => {
        expect(connectUrlAsDocumentBase('https://example.com/nango/connect/').toString()).toBe('https://example.com/nango/connect/');
    });
});

describe('buildConnectUiSessionLink', () => {
    it('should append the session token to a root URL', () => {
        expect(buildConnectUiSessionLink('t', 'http://localhost:3009')).toBe('http://localhost:3009/?session_token=t');
    });

    it('should append a trailing slash to a sub-path before the token', () => {
        expect(buildConnectUiSessionLink('t', 'https://example.com/nango/connect')).toBe('https://example.com/nango/connect/?session_token=t');
    });

    it('should URL-encode the token', () => {
        expect(buildConnectUiSessionLink('a b&c', 'http://localhost:3009')).toBe('http://localhost:3009/?session_token=a+b%26c');
    });
});
