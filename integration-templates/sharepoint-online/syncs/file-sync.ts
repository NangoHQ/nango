import type { NangoSync, FileMetadata, SharePointMetadata, Site } from '../../models';
import type { DriveItem } from '../types';
import { toFile } from '../mappers/to-file.js';

/**
 * Fetches data from SharePoint sites and processes list items for synchronization.
 *
 * @param nango An instance of NangoSync for handling synchronization tasks.
 * @returns Promise<void>
 */
export default async function fetchData(nango: NangoSync): Promise<void> {
    const metadata = await nango.getMetadata<SharePointMetadata>();

    if (!metadata || !Array.isArray(metadata.sitesToSync) || metadata.sitesToSync.length === 0) {
        throw new Error(`Metadata empty for connection id: ${nango.connectionId}`);
    }

    const siteIdToLists = await getSiteIdToLists(nango, metadata.sitesToSync);

    for (const [siteId, listIds] of Object.entries(siteIdToLists)) {
        for (const listId of listIds) {
            await processListItems(nango, siteId, listId);
        }
    }
}

/**
 * Retrieves site IDs and associated document libraries to sync from SharePoint.
 *
 * @param nango An instance of NangoSync for handling synchronization tasks.
 * @param sitesToSync An array of Site objects representing SharePoint sites.
 * @returns Promise<Record<string, string[]>>
 */
async function getSiteIdToLists(nango: NangoSync, sitesToSync: Site[]): Promise<Record<string, string[]>> {
    const siteIdToLists: Record<string, string[]> = {};

    for (const site of sitesToSync) {
        const siteId = site.id;
        const config = {
            endpoint: `v1.0/sites/${siteId}/lists`,
            paginate: {
                type: 'link',
                limit_name_in_request: '$top',
                response_path: 'value',
                link_path_in_response_body: '@odata.nextLink',
                limit: 100
            },
            retries: 10
        };
        // Paginate through lists and filter documentlibraries
        for await (const lists of nango.paginate(config)) {
            siteIdToLists[siteId] = lists.filter((list: any) => list.list.template === 'documentLibrary').map((l: any) => l.id);
        }
    }

    return siteIdToLists;
}

/**
 * Processes list items for synchronization from a SharePoint list.
 *
 * @param nango An instance of NangoSync for handling synchronization tasks.
 * @param siteId The ID of the SharePoint site containing the list.
 * @param listId The ID of the SharePoint list containing items to sync.
 * @returns Promise<void>
 */
async function processListItems(nango: NangoSync, siteId: string, listId: string): Promise<void> {
    const config = {
        endpoint: `/v1.0/sites/${siteId}/lists/${listId}/items/delta`,
        paginate: {
            type: 'link',
            limit_name_in_request: '$top',
            response_path: 'value',
            link_path_in_response_body: '@odata.nextLink',
            limit: 100
        },
        // Include '$filter' parameter with the lastSyncDate if available
        ...(nango.lastSyncDate ? { params: { $filter: `lastModifiedDateTime ge ${nango.lastSyncDate.toISOString()}` } } : {}),
        retries: 10
    };

    // Paginate through list items and sync each file metadata
    for await (const listItems of nango.paginate(config)) {
        for (const item of listItems) {
            const file = await fetchDriveItemDetails(nango, siteId, listId, item.id);
            await nango.batchSave<FileMetadata>([file], 'FileMetadata');
        }
    }
}

/**
 * Fetches details of a drive item (file) from SharePoint.
 *
 * @param nango An instance of NangoSync for handling synchronization tasks.
 * @param siteId The ID of the SharePoint site containing the list.
 * @param listId The ID of the SharePoint list containing the item.
 * @param itemId The ID of the drive item (file) to fetch details for.
 * @returns Promise<FileMetadata>
 */
async function fetchDriveItemDetails(nango: NangoSync, siteId: string, listId: string, itemId: string): Promise<FileMetadata> {
    const response = await nango.get<DriveItem>({
        endpoint: `/v1.0/sites/${siteId}/lists/${listId}/items/${itemId}/driveItem`,
        retries: 10
    });

    return toFile(response.data);
}
