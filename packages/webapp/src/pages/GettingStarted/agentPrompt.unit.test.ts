import { describe, expect, it } from 'vitest';

import { getInstallPrompt, pickPromptApiKey, QUICKSTART_URL } from './agentPrompt';

import type { ApiKeyListItem } from '@/hooks/useApiKeys';

function key(overrides: Partial<ApiKeyListItem>): ApiKeyListItem {
    return {
        id: 1,
        uuid: 'uuid',
        display_name: 'key',
        scopes: [],
        secret: 'secret',
        last_used_at: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        ...overrides
    };
}

describe('getInstallPrompt', () => {
    it('includes the key when there is one', () => {
        expect(getInstallPrompt({ apiKey: 'nango_sk_123', apiUrl: 'https://api.nango.dev' })).toBe(
            `Add Nango to my agent by following the steps here: ${QUICKSTART_URL}\nEnvironment API Key: nango_sk_123`
        );
    });

    it('leaves the key out when there is none', () => {
        expect(getInstallPrompt({ apiKey: null, apiUrl: 'https://api.nango.dev' })).toBe(
            `Add Nango to my agent by following the steps here: ${QUICKSTART_URL}`
        );
    });

    it('passes the API URL of a self-hosted or local instance', () => {
        expect(getInstallPrompt({ apiKey: 'nango_sk_123', apiUrl: 'http://localhost:3003' })).toBe(
            `Add Nango to my agent by following the steps here: ${QUICKSTART_URL}\nNango API URL: http://localhost:3003\nEnvironment API Key: nango_sk_123`
        );
    });
});

describe('pickPromptApiKey', () => {
    it('prefers the default full-access key', () => {
        const picked = pickPromptApiKey([
            key({ id: 1, display_name: 'CI', scopes: ['environment:*'] }),
            key({ id: 2, display_name: 'Default - Full access', scopes: ['environment:*'] })
        ]);
        expect(picked?.id).toBe(2);
    });

    it('falls back to another full-access key when the default was renamed', () => {
        const picked = pickPromptApiKey([
            key({ id: 1, display_name: 'Read only', scopes: ['environment:connections:read'] }),
            key({ id: 2, scopes: ['environment:*'] })
        ]);
        expect(picked?.id).toBe(2);
    });

    it('never picks a key with narrower scopes, even the default one', () => {
        expect(pickPromptApiKey([key({ display_name: 'Default - Full access', scopes: ['environment:connections:read'] })])).toBeNull();
    });
});
