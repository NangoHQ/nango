import type { InternalNango as Nango } from '../../shared-hook-logic';
import type { OAuth2ClientCredentials } from '@nangohq/types';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const clientId = (connection.credentials as OAuth2ClientCredentials).client_id;
    await nango.updateConnectionConfig({ clientId });
}
