import type { NangoAction, NangoSync, ProxyConfiguration } from '../../models';

export async function constructRequest(nango: NangoAction | NangoSync, endpoint: string): Promise<ProxyConfiguration> {
    const token = await nango.getToken();

    if (!token) {
        throw new nango.ActionError({
            message: `access_token is missing`
        });
    }

    const config = {
        endpoint,
        headers: {
            Authorization: 'Basic ' + Buffer.from(token + ':').toString('base64')
        },
        paginate: {
            type: 'link',
            response_path: 'data',
            link_path_in_response_body: 'next_href'
        }
    };

    return config;
}

export async function constructRequestWithConnectionConfig(
    nango: NangoAction,
    endpoint: string
): Promise<{ config: ProxyConfiguration; connection_config: Record<string, any> }> {
    const connection = await nango.getConnection();
    let access_token: string;
    if ('access_token' in connection.credentials) {
        access_token = connection.credentials.access_token;
    } else {
        throw new nango.ActionError({
            message: `access_token is missing`
        });
    }

    const config = {
        endpoint,
        headers: {
            Authorization: 'Basic ' + Buffer.from(access_token + ':').toString('base64')
        },
        paginate: {
            type: 'link',
            response_path: 'data',
            link_path_in_response_body: 'next_href'
        }
    };

    return { config, connection_config: connection.connection_config };
}
