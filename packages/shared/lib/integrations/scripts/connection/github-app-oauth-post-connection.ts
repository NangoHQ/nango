import type { InternalNango as Nango } from './connection.manager.js';
import { AuthModes, OAuthCredentials } from '../../../models/Auth.js';

export default async function execute(nango: Nango) {
    const response = await nango.proxy({
        endpoint: `/user`
    });

    if (!response || !response.data) {
        return;
    }

    const handle = response.data.login;

    const connection = await nango.getConnection();

    let updatedConfig: Record<string, string | OAuthCredentials> = {
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
