import { isAxiosError } from 'axios';

import type { InternalNango as Nango } from '../../credentials-verification-script.js';

const requestId = 'nango-credential-verification';
const rejectedLoginMessage = 'N-able Cove rejected the login request';
const invalidResponseMessage = 'N-able Cove returned an invalid login response';

export default async function execute(nango: Nango) {
    const { connection_config, credentials, provider_config_key } = nango.getConnection();
    const { apiKey } = credentials as { apiKey: string };
    const { partnerName, username } = connection_config as { partnerName: string; username: string };

    const response = await nango
        .proxy<unknown>({
            method: 'POST',
            endpoint: '/jsonapi',
            providerConfigKey: provider_config_key,
            data: {
                jsonrpc: '2.0',
                id: requestId,
                method: 'Login',
                params: {
                    partner: partnerName,
                    username,
                    password: apiKey
                }
            }
        })
        .catch((err: unknown) => {
            throw sanitizeProxyError(err, apiKey);
        });

    if (isAxiosError(response)) {
        throw sanitizeProxyError(response, apiKey);
    }

    validateLoginResponse(response.data);
}

function validateLoginResponse(data: unknown): void {
    if (!isRecord(data)) {
        throw new Error(invalidResponseMessage);
    }

    if ('error' in data) {
        throw new Error(rejectedLoginMessage);
    }

    const result = isRecord(data['result']) ? data['result']['result'] : undefined;
    if (
        data['jsonrpc'] !== '2.0' ||
        data['id'] !== requestId ||
        typeof data['visa'] !== 'string' ||
        data['visa'].trim().length === 0 ||
        !isRecord(result) ||
        Object.keys(result).length === 0
    ) {
        throw new Error(invalidResponseMessage);
    }

    const partnerId = result['PartnerId'];
    if (partnerId !== undefined && !Number.isInteger(partnerId)) {
        throw new Error(invalidResponseMessage);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeProxyError(error: unknown, apiKey: string): Error {
    if (!(error instanceof Error)) {
        return new Error('N-able Cove request failed');
    }

    const axiosError = isAxiosError<unknown>(error);
    const responseData: unknown = axiosError ? error.response?.data : undefined;
    const responseVisa = isRecord(responseData) && typeof responseData['visa'] === 'string' ? responseData['visa'] : undefined;
    const message = redactSecrets(error.message, [apiKey, responseVisa]);

    if (!axiosError && message === error.message) {
        return error;
    }

    const sanitizedError = new Error(message || 'N-able Cove request failed');
    sanitizedError.name = error.name;
    return sanitizedError;
}

function redactSecrets(message: string, secrets: (string | undefined)[]): string {
    let redacted = message;
    for (const secret of secrets) {
        if (secret) {
            redacted = redacted.replaceAll(secret, '[REDACTED]');
        }
    }
    return redacted;
}
