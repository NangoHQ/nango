import { describe, expect, it, vi } from 'vitest';

import { basePublicUrl } from '@nangohq/utils';

import oauthController from './oauth.controller.js';

import type { Request, Response } from 'express';

describe('OAuthController.oauthCallback', () => {
    it('redirects to a fixed internal URL, ignoring an attacker-controlled Referer, when installation completes without state', async () => {
        const redirect = vi.fn();
        const req = {
            query: { installation_id: 'install-1', setup_action: 'install' },
            get: vi.fn((header: string) => (header.toLowerCase() === 'referer' ? 'https://evil.example.com/phish' : undefined)),
            headers: { referer: 'https://evil.example.com/phish' }
        } as unknown as Request;
        const res = { redirect } as unknown as Response;

        await oauthController.oauthCallback(req, res, vi.fn());

        expect(redirect).toHaveBeenCalledWith(basePublicUrl);
        expect(redirect).not.toHaveBeenCalledWith(expect.stringContaining('evil.example.com'));
    });
});
