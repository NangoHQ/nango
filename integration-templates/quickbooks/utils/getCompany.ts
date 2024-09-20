import type { NangoAction } from '../../models';

/**
 * Retrieves the realmId for the QuickBooks instance from the Nango connection configuration.
 *
 * @param {NangoAction} nango - The NangoAction instance for handling the get Connection task.
 * @returns {Promise<string>} - The realmId for the QuickBooks instance.
 * @throws {Error} - Throws an error if the realmId cannot be retrieved.
 */
export async function getCompany(nango: NangoAction): Promise<string> {
    const connection = await nango.getConnection();
    const realmId = connection.connection_config['realmId'];

    if (realmId) {
        return realmId;
    }

    throw new Error('realmId not found in the connection configuration. Please reauthenticate to set the realmId');
}
