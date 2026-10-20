// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { analyticsSessionHeaders } from './analytics.js';

vi.hoisted(() => {
    vi.stubGlobal('_env', { apiUrl: 'http://localhost:3003', dashboardApiUrl: 'http://localhost:3003' });
});

vi.mock('posthog-js', () => ({ default: { get_session_id: () => 'session-1' } }));

describe('analyticsSessionHeaders', () => {
    it('sends the session to dashboard API routes', () => {
        expect(analyticsSessionHeaders(new URL('http://localhost:3003/api/v1/agent-playground/chat'))).toStrictEqual({
            'X-Nango-Analytics-Session-Id': 'session-1'
        });
    });

    it('leaves out the OAuth issuer on the same origin', () => {
        expect(analyticsSessionHeaders(new URL('http://localhost:3003/oauth/consent/abc'))).toStrictEqual({});
    });

    it('leaves out other origins', () => {
        expect(analyticsSessionHeaders(new URL('https://api.example.com/api/v1/connections'))).toStrictEqual({});
    });
});
