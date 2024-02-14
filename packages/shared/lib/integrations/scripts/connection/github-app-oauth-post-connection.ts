import type { InternalNango as Nango } from './connection.manager.js';
import { AuthModes, OAuth2Credentials } from '../../../models/Auth.js';
import axios from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const response = await nango.proxy({
        endpoint: `/user`,
        connectionId: connection.connection_id,
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response || !response.data) {
        return;
    }

    const handle = response.data.login;

    let updatedConfig: Record<string, string | OAuth2Credentials> = {
        handle
    };

    if (connection.credentials.type === AuthModes.OAuth2) {
        updatedConfig = {
            ...updatedConfig,
            userCredentials: connection.credentials
        };
    }

    await nango.updateConnectionConfig({ handle, userCredentials: connection.credentials });
}
