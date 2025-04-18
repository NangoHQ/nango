import { Err, Ok, axiosInstance as axios } from '@nangohq/utils';

import { AuthCredentialsError } from '../utils/error.js';
import { interpolateString } from '../utils/utils.js';

import type { ConnectionConfig, ProviderTableau, TableauCredentials } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

/**
 * Create Tableau credentials
 */
export async function createCredentials({
    patName,
    patSecret,
    contentUrl,
    provider,
    connectionConfig
}: {
    patName: TableauCredentials['pat_name'];
    patSecret: TableauCredentials['pat_secret'];
    contentUrl: TableauCredentials['content_url'];
    provider: ProviderTableau;
    connectionConfig: ConnectionConfig;
}): Promise<Result<TableauCredentials, AuthCredentialsError>> {
    const strippedTokenUrl = typeof provider.token_url === 'string' ? provider.token_url.replace(/connectionConfig\./g, '') : '';
    const url = new URL(interpolateString(strippedTokenUrl, connectionConfig)).toString();
    const postBody = {
        credentials: {
            personalAccessTokenName: patName,
            personalAccessTokenSecret: patSecret,
            site: {
                contentUrl: contentUrl ?? ''
            }
        }
    };

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json'
    };

    const requestOptions = { headers };

    try {
        const response = await axios.post(url, postBody, requestOptions);

        if (response.status !== 200) {
            return Err(new AuthCredentialsError('invalid_tableau_credentials'));
        }

        const { data } = response;

        const parseRes = parseCredentials(data);
        if (parseRes.isErr()) {
            return parseRes;
        }
        const creds = parseRes.value;
        creds.pat_name = patName;
        creds.pat_secret = patSecret;
        creds.content_url = contentUrl ?? '';

        return Ok(creds);
    } catch (err) {
        return Err(new AuthCredentialsError('tableau_tokens_fetch_error', { cause: err }));
    }
}

/**
 * Parse tableau credentials
 */
export function parseCredentials(rawCreds: Record<string, any>): Result<TableauCredentials, AuthCredentialsError> {
    if (!rawCreds['credentials']['token']) {
        return Err(new AuthCredentialsError(`incomplete_raw_credentials`));
    }

    let expiresAt: Date | undefined;
    if (rawCreds['credentials']['estimatedTimeToExpiration']) {
        expiresAt = parseExpirationDate(rawCreds['credentials']['estimatedTimeToExpiration']);
    }

    const tableauCredentials: TableauCredentials = {
        type: 'TABLEAU',
        token: rawCreds['credentials']['token'],
        expires_at: expiresAt,
        raw: rawCreds,
        pat_name: '',
        pat_secret: '',
        content_url: ''
    };

    return Ok(tableauCredentials);
}

function parseExpirationDate(timeStr: string): Date | undefined {
    // sample estimatedTimeToExpire: "estimatedTimeToExpiration": "177:05:38"
    const [days, hours, minutes] = timeStr.split(':').map(Number);

    if (days && hours && minutes) {
        const milliseconds = ((days * 24 + hours) * 60 + minutes) * 60 * 1000;
        return new Date(Date.now() + milliseconds);
    }

    return undefined;
}
