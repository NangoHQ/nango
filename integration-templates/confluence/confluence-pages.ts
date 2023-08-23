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
    let cloudId = await getCloudId(nango);
    const results = (await paginate(nango, 'get', 'wiki/api/v2/pages', 'Confluence pages', 250, cloudId));

    let pages: ConfluencePage[] = results?.map((page: any) => {
        return ({
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
                atlas_doc_format: page.body.atlas_doc_format,
            }
        })
    })

    await nango.log(`Fetching ${pages.length}`);
    await nango.batchSave(pages, 'ConfluencePage');
    return { 'ConfluencePage': [...pages] };
}

async function paginate(nango: NangoSync, method: 'get' | 'post', endpoint: string, desc: string, pageSize = 250, cloudId: string) {
    let pageCounter = 0;
    let results: any[] = [];

    while (true) {
        await nango.log(`Fetching ${desc}  - with pageCounter = ${pageCounter} & pageSize = ${pageSize}`);
        const res = await nango.get({
            baseUrlOverride: `https://api.atlassian.com`, // Optional
            endpoint: `ex/confluence/${cloudId}/${endpoint}`,
            method: method,
            params: { limit: `${pageSize}`, "body-format": "storage" }, // Page format storage or atlas_doc_format
            retries: 10 // Exponential backoff + long-running job = handles rate limits well.
        });
        await nango.log(`Appending records of count ${res.data.results.length} to results`)
        if (res.data) {
            results = [ ...results, ...res.data.results]
        }
        if (res.data["_links"].next) {
            endpoint = res.data["_links"].next;
            pageCounter += 1;
        } else {
            return results
        }
    }
}