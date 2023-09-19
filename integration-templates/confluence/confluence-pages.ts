import type { NangoSync, ConfluencePage } from './models';

async function getCloudId(nango: NangoSync): Promise<string> {
    const response = await nango.get({
        baseUrlOverride: 'https://api.atlassian.com',
        endpoint: `oauth/token/accessible-resources`,
        retries: 10 // Exponential backoff + long-running job = handles rate limits well.
    });
    return response.data[0].id;
}

interface ResultPage {
    pageNumber: number;
    results: any[];
    nextPageEndpoint: string;
    totalResultCount: number;
}

export default async function fetchData(nango: NangoSync) {
    let cloudId = await getCloudId(nango);

    let resultPage: ResultPage | null = null;
    while (true) {
        resultPage = await getNextPage(nango, 'get', 'wiki/api/v2/pages', resultPage, 2, cloudId);

        if (!resultPage) {
            break;
        }

        let confluencePages = mapConfluencePages(resultPage.results);

        await nango.batchSave(confluencePages, 'ConfluencePage');
    }
}

async function getNextPage(
    nango: NangoSync,
    method: 'get' | 'post',
    endpoint: string,
    prevResultPage: ResultPage | null,
    pageSize = 250,
    cloudId: string
): Promise<ResultPage | null> {
    if (prevResultPage && !prevResultPage.nextPageEndpoint) {
        return null;
    }

    await nango.log(`Fetching Confluence Pages - with pageCounter = ${prevResultPage ? prevResultPage.pageNumber : 0} & pageSize = ${pageSize}`);

    const res = await nango.get({
        baseUrlOverride: `https://api.atlassian.com`, // Optional
        endpoint: `ex/confluence/${cloudId}/${prevResultPage ? prevResultPage.nextPageEndpoint : endpoint}`,
        method: method,
        params: { limit: `${pageSize}`, 'body-format': 'storage' }, // Page format storage or atlas_doc_format
        retries: 10 // Exponential backoff + long-running job = handles rate limits well.
    });

    if (!res.data) {
        return null;
    }

    const resultPage = {
        pageNumber: prevResultPage ? prevResultPage.pageNumber + 1 : 1,
        results: res.data.results,
        nextPageEndpoint: res.data['_links'].next ? res.data['_links'].next : '',
        totalResultCount: prevResultPage ? prevResultPage.totalResultCount + res.data.results.length : res.data.results.length
    };

    await nango.log(`Saving page with ${resultPage.results.length} records (total records: ${resultPage.totalResultCount})`);

    return resultPage;
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
