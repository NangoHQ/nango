import crypto from 'crypto';
import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { AWSAuthHeader, AWSIAMRequestParams, ListUsersResponse, ErrorResponse } from './types.js';

export default async function execute(nango: Nango) {
    try {
        const { credentials, provider_config_key, connection_config } = nango.getConnection();

        const { username, password } = credentials as { username: string; password: string };

        const requestParams: AWSIAMRequestParams = {
            method: 'GET',
            service: 'iam',
            path: '/',
            params: {
                Action: 'ListUsers',
                Version: '2010-05-08'
            }
        };

        const queryParams = new URLSearchParams(requestParams.params).toString();
        const { authorizationHeader, date } = getAWSAuthHeader(
            requestParams.method,
            requestParams.service,
            requestParams.path,
            queryParams,
            username,
            password,
            connection_config['region']
        );

        await nango.proxy<ErrorResponse | { ListUsersResponse: ListUsersResponse }>({
            baseUrlOverride: 'https://iam.amazonaws.com',
            endpoint: '/',
            params: requestParams.params,
            headers: {
                Authorization: authorizationHeader,
                'x-amz-date': date
            },
            providerConfigKey: provider_config_key
        });
    } catch {
        throw new Error('Invalid AWS credentials or permissions.');
    }
}

function getAWSAuthHeader(
    method: string,
    service: string,
    path: string,
    querystring: string,
    accessKeyId: string,
    secretAccessKey: string,
    region: string
): AWSAuthHeader {
    const host = 'iam.amazonaws.com';

    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const payloadHash = crypto.createHash('sha256').update('').digest('hex');
    const canonicalHeaders = `host:${host}\nx-amz-date:${date}\n`;
    const signedHeaders = 'host;x-amz-date';
    const canonicalRequest = `${method}\n${path}\n${querystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope = `${date.substr(0, 8)}/${region}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

    const getSignatureKey = (key: string, dateStamp: string, regionName: string, serviceName: string) => {
        const kDate = crypto.createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
        const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
        const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
        return crypto.createHmac('sha256', kService).update('aws4_request').digest();
    };

    const signingKey = getSignatureKey(secretAccessKey, date.substr(0, 8), region, service);
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    return {
        authorizationHeader: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        date
    };
}
