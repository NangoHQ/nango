import crypto from 'crypto';
import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { AWSAuthHeader, AWSIAMRequestParams, ErrorResponse, GetCallerIdentityResponse, AWSAuthHeaderParams } from './types.js';

export default async function execute(nango: Nango) {
    try {
        const { credentials, provider_config_key, connection_config } = nango.getConnection();

        const { username, password } = credentials as { username: string; password: string };

        const requestParams: AWSIAMRequestParams = {
            method: 'GET',
            service: 'sts',
            path: '/',
            params: {
                Action: 'GetCallerIdentity',
                Version: '2011-06-15'
            }
        };

        const queryParams = new URLSearchParams(requestParams.params).toString();
        const { authorizationHeader, date } = getAWSAuthHeader({
            method: requestParams.method,
            service: requestParams.service,
            path: requestParams.path,
            querystring: queryParams,
            accessKeyId: username,
            secretAccessKey: password,
            region: connection_config['region']
        });

        await nango.proxy<ErrorResponse | GetCallerIdentityResponse>({
            baseUrlOverride: `https://sts.amazonaws.com`,
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

function getAWSAuthHeader(params: AWSAuthHeaderParams): AWSAuthHeader {
    const { method, service, path, querystring, accessKeyId, secretAccessKey, region } = params;

    const host = 'sts.amazonaws.com';

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
