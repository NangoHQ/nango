import { describe, expect, it, vi } from 'vitest';

import execute from './credentials-verification.js';

import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { AxiosResponse } from 'axios';

const apiKey = 'cove-secret-token';
const visa = 'cove-secret-visa';

describe('N-able Cove credentials verification', () => {
    it('constructs the Login request with the configured credentials', async () => {
        const { nango, proxy } = createNango(successResponse());

        await execute(nango);

        expect(proxy).toHaveBeenCalledOnce();
        expect(proxy).toHaveBeenCalledWith({
            method: 'POST',
            endpoint: '/jsonapi',
            providerConfigKey: 'nable-cove',
            data: {
                jsonrpc: '2.0',
                id: 'nango-credential-verification',
                method: 'Login',
                params: {
                    partner: 'Acme Managed Services',
                    username: 'api-user',
                    password: apiKey
                }
            }
        });
    });

    it('accepts a successful Login response', async () => {
        const { nango } = createNango(successResponse());

        await expect(execute(nango)).resolves.toBeUndefined();
    });

    it('rejects an HTTP 200 JSON-RPC error response', async () => {
        const { nango } = createNango({
            jsonrpc: '2.0',
            id: 'nango-credential-verification',
            error: {
                code: -32001,
                message: 'Authentication failed'
            }
        });

        await expect(execute(nango)).rejects.toThrow('N-able Cove rejected the login request');
    });

    it.each([undefined, '', '   '])('rejects a missing or empty visa: %j', async (responseVisa) => {
        const response = successResponse();
        response.visa = responseVisa;
        const { nango } = createNango(response);

        await expect(execute(nango)).rejects.toThrow('N-able Cove returned an invalid login response');
    });

    it.each([
        { jsonrpc: '2.0', id: 'nango-credential-verification', visa },
        { jsonrpc: '2.0', id: 'nango-credential-verification', visa, result: {} },
        { jsonrpc: '2.0', id: 'nango-credential-verification', visa, result: { result: null } },
        { jsonrpc: '2.0', id: 'nango-credential-verification', visa, result: { result: {} } },
        { jsonrpc: '2.0', id: 'nango-credential-verification', visa, result: { result: { PartnerId: '33491' } } }
    ])('rejects a malformed nested result', async (response) => {
        const { nango } = createNango(response);

        await expect(execute(nango)).rejects.toThrow('N-able Cove returned an invalid login response');
    });

    it('propagates transport errors unchanged', async () => {
        const transportError = new Error('connect ECONNREFUSED');
        const { nango, proxy } = createNango(successResponse());
        proxy.mockRejectedValueOnce(transportError);

        await expect(execute(nango)).rejects.toBe(transportError);
    });

    it('sanitizes Axios errors without exposing request or response secrets', async () => {
        const axiosError = Object.assign(new Error(`Request failed for ${apiKey} with ${visa}`), {
            name: 'AxiosError',
            isAxiosError: true,
            config: {
                data: {
                    password: apiKey
                }
            },
            response: {
                status: 503,
                data: {
                    visa
                }
            }
        });
        const { nango, proxy } = createNango(successResponse());
        proxy.mockResolvedValueOnce(axiosError);

        const error = await execute(nango).catch((err: unknown) => err);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBe(axiosError);
        expect((error as Error).name).toBe('AxiosError');
        expect((error as Error).message).not.toContain(apiKey);
        expect((error as Error).message).not.toContain(visa);
        expect(error).not.toHaveProperty('config');
        expect(error).not.toHaveProperty('response');
    });

    it('does not leak the API token or visa in generated error messages', async () => {
        const { nango } = createNango({
            jsonrpc: '2.0',
            id: 'nango-credential-verification',
            visa,
            error: {
                code: -32001,
                message: `Authentication failed for ${apiKey} with ${visa}`
            }
        });

        const error = await execute(nango).catch((err: unknown) => err);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain(apiKey);
        expect((error as Error).message).not.toContain(visa);
    });
});

function successResponse(): {
    jsonrpc: string;
    id: string;
    visa: string | undefined;
    result: { result: { PartnerId: number } };
} {
    return {
        jsonrpc: '2.0',
        id: 'nango-credential-verification',
        visa,
        result: {
            result: {
                PartnerId: 33491
            }
        }
    };
}

function createNango(responseData: unknown): { nango: Nango; proxy: ReturnType<typeof vi.fn> } {
    const proxy = vi.fn().mockResolvedValue({ data: responseData } as AxiosResponse);
    const nango = {
        getConnection: () => ({
            provider_config_key: 'nable-cove',
            connection_config: {
                partnerName: 'Acme Managed Services',
                username: 'api-user'
            },
            credentials: {
                type: 'API_KEY',
                apiKey
            }
        }),
        proxy
    } as unknown as Nango;

    return { nango, proxy };
}
