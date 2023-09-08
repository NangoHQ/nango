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
    let cloudId = await getCloudId(nango);
    const results = await paginate(nango, 'get', 'wiki/api/v2/spaces', 'Confluence spaces', 250, cloudId);

    let spaces: ConfluenceSpace[] = results?.map((space: any) => {
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

    await nango.log(`Fetching ${spaces.length}`);
    await nango.batchSave(spaces, 'ConfluenceSpace');
}

async function paginate(nango: NangoSync, method: 'get' | 'post', endpoint: string, desc: string, pageSize = 250, cloudId: string) {
    let pageCounter = 0;
    let results: any[] = [];

    while (true) {
        await nango.log(`Fetching ${desc} - with pageCounter = ${pageCounter} & pageSize = ${pageSize}`);
        const res = await nango.get({
            baseUrlOverride: `https://api.atlassian.com`, // Optional
            endpoint: `ex/confluence/${cloudId}/${endpoint}`,
            method: method,
            params: { limit: `${pageSize}` },
            retries: 10 // Exponential backoff + long-running job = handles rate limits well.
        });
        await nango.log(`Appending records of count ${res.data.results.length} to results of count ${results.length}`);
        if (res.data) {
            results = [...results, ...res.data.results];
        }
        if (res.data['_links'].next) {
            endpoint = res.data['_links'].next;
            pageCounter += 1;
        } else {
            return results;
        }
    }
}
