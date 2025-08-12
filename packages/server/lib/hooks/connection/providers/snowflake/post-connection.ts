import axios from 'axios';

import { getLogger } from '@nangohq/utils';

import type { SnowflakeQueryResponse } from './types.js';
import type { InternalNango as Nango } from '../../internal-nango.js';

const logger = getLogger('post-connection:snowflake');

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const response = await nango.proxy<SnowflakeQueryResponse>({
        method: 'POST',
        endpoint: '/api/v2/statements',
        providerConfigKey: connection.provider_config_key,
        data: {
            statement: 'SELECT CURRENT_USER() AS username'
        }
    });

    if (!response || axios.isAxiosError(response) || !response.data?.data || !Array.isArray(response.data.data) || response.data.data.length === 0) {
        logger.warning('Invalid response data structure:');
        return;
    }

    const username = response.data.data[0]?.[0];
    if (username) {
        await nango.updateConnectionConfig({
            username: username
        });
    }
}
