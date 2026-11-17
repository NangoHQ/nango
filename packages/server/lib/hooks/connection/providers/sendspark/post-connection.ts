import axios from 'axios';

import type { InternalNango as Nango } from '../../internal-nango.js';
import type { SendsparkWorkspaceIdentifierResponse } from './types.js';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    // https://help.sendspark.com/api-reference/workspace/get-workspace-id-by-api-key
    const response = await nango.proxy<SendsparkWorkspaceIdentifierResponse>({
        method: 'GET',
        endpoint: '/v1/workspaces/identifier',
        providerConfigKey: connection.provider_config_key
    });

    if (!response || axios.isAxiosError(response) || !response.data?.workspaceId) {
        return;
    }

    await nango.updateConnectionConfig({ workspaceId: response.data.workspaceId });
}
