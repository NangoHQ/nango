import { afterEach, describe, expect, it, vi } from 'vitest';

import { axiosInstance, report } from '@nangohq/utils';

import { deregisterClientId } from './mcp.client.js';

import type * as NangoUtils from '@nangohq/utils';

vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof NangoUtils>();
    return { ...actual, report: vi.fn() };
});

describe('deregisterClientId', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('sends the bearer token to a same-origin HTTPS registration_client_uri, with redirects disabled', async () => {
        const deleteSpy = vi.spyOn(axiosInstance, 'delete').mockResolvedValue({});

        await deregisterClientId({
            registrationUrl: 'https://mcp.example.com/register',
            registrationClientUri: 'https://mcp.example.com/register/abc',
            registrationAccessToken: 'reg-token'
        });

        expect(deleteSpy).toHaveBeenCalledWith('https://mcp.example.com/register/abc', {
            maxRedirects: 0,
            headers: { Authorization: 'Bearer reg-token' }
        });
        expect(report).not.toHaveBeenCalled();
    });

    it('refuses to send the token when registration_client_uri is a different origin than the registration URL', async () => {
        const deleteSpy = vi.spyOn(axiosInstance, 'delete').mockResolvedValue({});

        await deregisterClientId({
            registrationUrl: 'https://mcp.example.com/register',
            registrationClientUri: 'https://attacker.example.com/steal-token',
            registrationAccessToken: 'reg-token'
        });

        expect(deleteSpy).not.toHaveBeenCalled();
        expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('not a trusted HTTPS origin') }));
    });

    it('refuses a non-HTTPS registration_client_uri even on the same host', async () => {
        const deleteSpy = vi.spyOn(axiosInstance, 'delete').mockResolvedValue({});

        await deregisterClientId({
            registrationUrl: 'https://mcp.example.com/register',
            registrationClientUri: 'http://mcp.example.com/register/abc',
            registrationAccessToken: 'reg-token'
        });

        expect(deleteSpy).not.toHaveBeenCalled();
        expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('not a trusted HTTPS origin') }));
    });

    it('refuses an unparseable registration_client_uri', async () => {
        const deleteSpy = vi.spyOn(axiosInstance, 'delete').mockResolvedValue({});

        await deregisterClientId({
            registrationUrl: 'https://mcp.example.com/register',
            registrationClientUri: 'not-a-url',
            registrationAccessToken: 'reg-token'
        });

        expect(deleteSpy).not.toHaveBeenCalled();
        expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('invalid registration URL') }));
    });

    it('omits the Authorization header when there is no access token', async () => {
        const deleteSpy = vi.spyOn(axiosInstance, 'delete').mockResolvedValue({});

        await deregisterClientId({
            registrationUrl: 'https://mcp.example.com/register',
            registrationClientUri: 'https://mcp.example.com/register/abc'
        });

        expect(deleteSpy).toHaveBeenCalledWith('https://mcp.example.com/register/abc', { maxRedirects: 0 });
    });
});
