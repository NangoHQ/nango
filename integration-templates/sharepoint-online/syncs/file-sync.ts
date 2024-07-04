import type { NangoSync, FileMetadata } from '../../models';
import type { PaginationParams, PaginationResponse } from '../helper/pagination';
import paginate from '../helper/pagination.js';
import type { SharePointMetadata } from '../types';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const metadata = (await nango.getMetadata()) as SharePointMetadata;

    if (!metadata || !metadata.sitesToSync || metadata.sitesToSync.length === 0) {
        throw new Error(`Metadata empty for connection id: ${nango.connectionId}`);
    }

    metadata.syncedSites = metadata.syncedSites || [];

    const siteIdToLists = await getSiteIdToLists(nango, metadata.sitesToSync);

    for (const [siteId, listIds] of Object.entries(siteIdToLists)) {
        for (const listId of listIds) {
            try {
                const deltaToken = getDeltaToken(metadata, siteId, listId);

                const params: PaginationParams = {
                    endpoint: `/v1.0/sites/${siteId}/lists/${listId}/items/delta`,
                    deltaToken: deltaToken,
                    $top: 100
                };

                const newDeltaToken = await processListItems(nango, params, siteId, listId);

                if (newDeltaToken) {
                    await updateDeltaToken(nango, metadata, siteId, listId, newDeltaToken);
                }
            } catch (error) {
                throw new Error(`Error in fetchData: ${error}`);
            }
        }
    }
}

async function getSiteIdToLists(nango: NangoSync, sitesToSync: string[]): Promise<Record<string, string[]>> {
    const siteIdToLists: Record<string, string[]> = {};

    for (const siteId of sitesToSync) {
        const params: PaginationParams = { endpoint: `v1.0/sites/${siteId}/lists` };
        const lists = await collectPaginatedData<{ list: { template: string } }>(nango, params);

        const documentLibraries = lists.filter((list: any) => list.list.template === 'documentLibrary');
        siteIdToLists[siteId] = documentLibraries.map((l: any) => l.id);
    }

    return siteIdToLists;
}

function getDeltaToken(metadata: SharePointMetadata, siteId: string, listId: string): string {
    return metadata.syncedSites?.find((site) => site.id === siteId && site.listId === listId)?.deltaToken || '';
}

async function processListItems(nango: NangoSync, params: PaginationParams, siteId: string, listId: string): Promise<string> {
    let newDeltaToken = '';

    await collectPaginatedData<FileMetadata>(nango, params, async (page: PaginationResponse<FileMetadata>) => {
        for (const item of page.value) {
            const file = await fetchDriveItemDetails(nango, siteId, listId, item.id);
            const metadata = fileMetadata(file);
            await nango.batchSave<FileMetadata>([metadata], 'FileMetadata');
        }

        newDeltaToken = page.deltaToken ?? '';
    });

    return newDeltaToken;
}

async function updateDeltaToken(nango: NangoSync, metadata: SharePointMetadata, siteId: string, listId: string, newDeltaToken: string): Promise<void> {
    metadata.syncedSites = metadata.syncedSites || [];

    const updatedSite = { id: siteId, listId, deltaToken: newDeltaToken };

    const existingIndex = metadata.syncedSites.findIndex((site) => site.id === siteId && site.listId === listId);
    if (existingIndex >= 0) {
        metadata.syncedSites[existingIndex] = updatedSite;
    } else {
        metadata.syncedSites.push(updatedSite);
    }

    await nango.updateMetadata({ syncedSites: metadata.syncedSites });
}

async function fetchDriveItemDetails(nango: NangoSync, siteId: string, listId: string, itemId: string): Promise<FileMetadata> {
    const response = await nango.get({
        endpoint: `/v1.0/sites/${siteId}/lists/${listId}/items/${itemId}/driveItem`,
        retries: 10
    });
    return response.data;
}

function fileMetadata(item: any): FileMetadata {
    return {
        etag: item.eTag,
        id: item.id,
        is_folder: 'folder' in item,
        mime_type: 'folder' in item ? '' : item.file.mimeType,
        path: item.parentReference.path,
        raw_source: item,
        updated_at: new Date(item.lastModifiedDateTime),
        download_url: 'folder' in item ? '' : item.downloadUrl,
        created_at: new Date(item.createdDateTime),
        blob_size: item.size
    };
}

async function collectPaginatedData<T>(
    nango: NangoSync,
    params: PaginationParams,
    transformPage: (page: PaginationResponse<T>) => Promise<void> = async () => {}
): Promise<T[]> {
    const allData: T[] = [];

    for await (const page of paginate<T>(nango, params)) {
        await transformPage(page);
        allData.push(...page.value);
    }

    return allData;
}
