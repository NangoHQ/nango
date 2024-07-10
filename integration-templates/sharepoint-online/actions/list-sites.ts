import type { NangoAction, Site, SharePointMetadata } from '../../models';
import type { SharePointSite } from '../types';
import { toSite } from '../mappers/to-site.js';

/**
 * Retrieves SharePoint sites using NangoAction, maps them to Site objects,
 * updates the SharePoint metadata with the sites to sync, and returns the mapped sites.
 *
 * @param nango An instance of NangoAction for handling listing of sites.
 * @param _input Optional input parameter (not typically used for this specific action).
 * @returns An array of Site objects representing SharePoint sites
 */
export default async function runAction(nango: NangoAction, _input?: void): Promise<Site[]> {
    const response = await nango.get<{ value: SharePointSite[] }>({
        endpoint: 'v1.0/sites',
        params: {
            search: '*'
        },
        retries: 10
    });

    const { value: sites } = response.data;

    const mappedSites = sites.map(toSite);

    let metadata: Partial<SharePointMetadata> = (await nango.getMetadata()) || {};
    metadata = {
        ...metadata,
        sitesToSync: mappedSites
    };

    await nango.updateMetadata(metadata);

    return mappedSites;
}
