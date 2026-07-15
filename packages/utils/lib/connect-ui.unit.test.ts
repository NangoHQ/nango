import { describe, expect, it } from 'vitest';

import { buildConnectUiSessionLink } from './connect-ui.js';

describe('buildConnectUiSessionLink', () => {
    it('defaults to the local Connect UI URL', () => {
        expect(buildConnectUiSessionLink('tok')).toBe('http://localhost:3009/?session_token=tok');
    });

    it('appends the session token to the connect URL', () => {
        expect(buildConnectUiSessionLink('tok', 'https://connect.example.com')).toBe('https://connect.example.com/?session_token=tok');
    });

    it('preserves a non-root base path already in the connect URL', () => {
        expect(buildConnectUiSessionLink('tok', 'https://example.com/nango/connect')).toBe('https://example.com/nango/connect?session_token=tok');
    });
});
