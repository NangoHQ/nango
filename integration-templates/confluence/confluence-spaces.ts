import type { NangoSync, ConfluenceSpace } from './models';

async function getCloudId(nango: NangoSync): Promise<string> {
    const response = await nango.get({
        baseUrlOverride: 'https://api.atlassian.com',
        endpoint: `oauth/token/accessible-resources`,
        retries: 10 // Exponential backoff + long-running job = handles rate limits well.
    });
    return response.data[0].id;
}

export default async function fetchData(nango: NangoSync) {
    const cloudId = await getCloudId(nango);
    let totalRecords = 0;

    const proxyConfig = {
        baseUrlOverride: `https://api.atlassian.com/ex/confluence/${cloudId}`, // The base URL is specific for user because of the cloud ID path param
        endpoint: `/wiki/api/v2/spaces`,
        retries: 10,
        paginate: {
            limit: 250
        }
    };
    for await (const spaceBatch of nango.paginate(proxyConfig)) {
        const confluenceSpaces = mapConfluenceSpaces(spaceBatch);
        const batchSize: number = confluenceSpaces.length;
        totalRecords += batchSize;

        await nango.log(`Saving batch of ${batchSize} spaces (total records: ${totalRecords})`);
        await nango.batchSave(confluenceSpaces, 'ConfluenceSpace');
    }
}

function mapConfluenceSpaces(spaces: any[]): ConfluenceSpace[] {
    return spaces.map((space: any) => {
        return {
            id: space.id,
            key: space.key,
            name: space.name,
            type: space.type,
            status: space.status,
            authorId: space.authorId,
            createdAt: space.createdAt,
            homepageId: space.homepageId,
            description: space.description || ''
        };
    });
}
