import ms from 'ms';

import { Err, Ok, axiosInstance as axios } from '@nangohq/utils';

import { AuthCredentialsError } from '../utils/error.js';

import type { BillCredentials, ProviderBill } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const DEFAULT_EXPIRES_AT_MS = ms('35minutes'); //This ensures we have an expireAt value for Bill

/**
 * Create Bill credentials
 *
 * TODO: can maybe be replaced by TWO_STEP
 */
export async function createCredentials({
    username,
    password,
    organizationId,
    devKey,
    provider
}: {
    username: BillCredentials['username'];
    password: BillCredentials['password'];
    organizationId: BillCredentials['organization_id'];
    devKey: BillCredentials['dev_key'];
    provider: ProviderBill;
}): Promise<Result<BillCredentials, AuthCredentialsError>> {
    if (!provider.token_url || typeof provider.token_url !== 'string') {
        return Err(new AuthCredentialsError('missing_token_url'));
    }

    const postBody = {
        username: username,
        password: password,
        organizationId: organizationId,
        devKey: devKey
    };

    const headers: Record<string, string> = {
        'content-type': 'application/json'
    };

    try {
        const response = await axios.post(provider.token_url, postBody, {
            headers
        });

        if (response.status !== 200) {
            return Err(new AuthCredentialsError('invalid_bill_credentials'));
        }

        const { data } = response;

        const parseRes = parseCredentials(data);
        if (parseRes.isErr()) {
            return parseRes;
        }

        const creds = parseRes.value;
        creds.username = username;
        creds.password = password;
        creds.dev_key = devKey;

        return Ok(creds);
    } catch (err) {
        return Err(new AuthCredentialsError('bill_tokens_fetch_error', { cause: err }));
    }
}

/**
 * Parse Bill credentials
 */
export function parseCredentials(rawCreds: Record<string, any>): Result<BillCredentials, AuthCredentialsError> {
    if (!rawCreds['sessionId']) {
        throw new AuthCredentialsError(`incomplete_raw_credentials`);
    }

    const expiresAt = new Date(Date.now() + DEFAULT_EXPIRES_AT_MS);
    const creds: BillCredentials = {
        type: 'BILL',
        username: '',
        password: '',
        organization_id: rawCreds['organizationId'],
        dev_key: '',
        raw: rawCreds,
        session_id: rawCreds['sessionId'],
        user_id: rawCreds['userId'],
        expires_at: expiresAt
    };
    return Ok(creds);
}
