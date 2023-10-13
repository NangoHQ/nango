import type { NangoSync, ConfluencePage } from './models';

async function getCloudId(nango: NangoSync): Promise<string> {
    const response = await nango.get({
        baseUrlOverride: 'https://api.atlassian.com',
        endpoint: `oauth/token/accessible-resources`,
        retries: 10 // Exponential backoff + long-running job = handles rate limits well.
    });

    return response.data[0].id;
}

export default async function fetchData(nango: NangoSync) {
    let totalRecords: number = 0;

    let cloudId: string = await getCloudId(nango);
    const proxyConfig = {
        baseUrlOverride: `https://api.atlassian.com/ex/confluence/${cloudId}`, // The base URL is specific for user because of the cloud ID path param
        endpoint: `/wiki/api/v2/pages`,
        retries: 10
    };
    for await (const pageBatch of nango.paginate(proxyConfig)) {
        const confluencePages = mapConfluencePages(pageBatch);
        const batchSize: number = confluencePages.length;
        totalRecords += batchSize;

        await nango.log(`Saving batch of ${batchSize} pages (total records: ${totalRecords})`);
        await nango.batchSave(confluencePages, 'ConfluencePage');
    }
}

function mapConfluencePages(results: any[]): ConfluencePage[] {
    return results.map((page: any) => {
        return {
            id: page.id,
            title: page.title,
            type: page.type,
            status: page.status,
            authorId: page.authorId,
            createdAt: page.createdAt,
            spaceId: page.spaceId,
            parentId: page.parentId,
            parentType: page.parentType,
            position: page.position,
            version: {
                createdAt: page.version.createdAt,
                message: page.version.message,
                number: page.version.number,
                minorEdit: page.version.minorEdit,
                authorId: page.version.authorId
            },
            body: {
                storage: page.body.storage,
                atlas_doc_format: page.body.atlas_doc_format
            }
        };
    });
}
