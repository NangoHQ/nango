import { describe, expect, it } from 'vitest';

import { OutboundUrlError } from '@nangohq/egress';

import { assertSafeOAuthUrl, getOAuthOutboundUrlPolicy, getOAuthSafeHttpAgents, getOAuthSafeUndiciDispatcher } from './outbound-policy.js';

describe('OAuth outbound url policy', () => {
    it('allows RFC1918 by default so self-hosted token endpoints keep working', () => {
        expect(getOAuthOutboundUrlPolicy().blockPrivateIps).toBe(false);
    });

    it('allows a private IP-literal token URL by default', async () => {
        await expect(assertSafeOAuthUrl('http://10.0.0.5/oauth/token')).resolves.toBeInstanceOf(URL);
    });

    it('blocks loopback and cloud-metadata token URLs (fail closed)', async () => {
        await expect(assertSafeOAuthUrl('http://127.0.0.1/oauth/token')).rejects.toBeInstanceOf(OutboundUrlError);
        await expect(assertSafeOAuthUrl('http://169.254.169.254/oauth/token')).rejects.toBeInstanceOf(OutboundUrlError);
        await expect(assertSafeOAuthUrl('http://localhost/oauth/token')).rejects.toBeInstanceOf(OutboundUrlError);
    });

    it('exposes pinned node agents and an undici dispatcher for OAuth requests', () => {
        const agents = getOAuthSafeHttpAgents();
        expect(agents.httpAgent).toBeDefined();
        expect(agents.httpsAgent).toBeDefined();
        expect(getOAuthSafeUndiciDispatcher()).toBeDefined();
    });
});
