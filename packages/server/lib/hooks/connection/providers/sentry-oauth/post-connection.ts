import type { InternalNango as Nango } from '../../internal-nango.js';
import axios from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const installId = connection.connection_config['installation.uuid'];

    if (!installId) {
        throw new Error('Missing installation UUID in connection config.');
    }

    const response = await nango.proxy({
        method: 'PUT',
        baseUrlOverride: `https://sentry.io/api/0/sentry-app-installations`,
        endpoint: `/${installId}/`,
        providerConfigKey: connection.provider_config_key,
        data: {
            status: 'installed'
        }
    });

    if (!response || axios.isAxiosError(response) || response.data?.status !== 'installed') {
        return;
    }

    const { connection_config } = connection;

    if ('pending' in connection_config) {
        await nango.unsetConnectionConfigAttributes('pending');
    }
}
