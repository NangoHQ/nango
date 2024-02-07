import type { NangoSync, NotionPage } from './models';

/**
 * This syncs:
 *  - pages
 *  - sub-pages (any nesting level)
 *  - database entries (which are also pages in Notion)
 *  - entries of sub-databases (any nesting level)
 *
 * For each of these it will retrieve:
 *  - Page id
 *  - Title
 *  - URL
 *  - Plain text content of the page
 *  - Id of the parent page
 *
 * Note that it only retrieves text content:
 * It ignores images, files and other blocks that do not have a `rich_text` property.
 * https://developers.notion.com/reference/rich-text
 *
 */

export default async function fetchData(nango: NangoSync) {
    const pages = (await paginate(nango, 'post', '/v1/search', 'Notion pages', 100, true)).filter((result: any) => result.object === 'page');
    const batchSize = 10;
    await nango.log(`Found ${pages.length} new/updated Notion pages to sync.`);

    for (let i = 0; i < pages.length; i += batchSize) {
        await nango.log(`Fetching plain text, in batch of ${batchSize} Notion pages, from page ${i + 1} (total pages: ${pages.length})`);
        const batchOfPages = pages.slice(i, Math.min(pages.length, i + batchSize));
        const pagesWithPlainText = await Promise.all(batchOfPages.map(async (page: any) => mapPage(page, await fetchPlainText(page, nango))));
        await nango.batchSave(pagesWithPlainText, 'NotionPage');
    }
}

async function fetchPlainText(page: any, nango: NangoSync): Promise<string> {
    const blocks = await paginate(nango, 'get', `/v1/blocks/${page.id}/children`, 'Notion blocks', 100);
    return findAllByKey(blocks, 'rich_text')
        .map((richText: any) => richTextToPlainText(richText))
        .join('\n');
}

async function paginate(nango: NangoSync, method: 'get' | 'post', endpoint: string, desc: string, pageSize = 100, incremental = false) {
    let cursor: string | undefined;
    let pageCounter = 0;
    let results: any[] = [];

    while (true) {
        await nango.log(`Fetching ${desc} ${pageCounter * pageSize + 1} to ${++pageCounter * pageSize}`);

        const res = await nango.proxy({
            method: method,
            endpoint: endpoint,
            data: method === 'post' ? { page_size: pageSize, start_cursor: cursor } : {},
            params: method === 'get' ? ({ page_size: `${pageSize}`, start_cursor: cursor } as any) : {},
            retries: 10 // Exponential backoff + long-running job = handles rate limits well.
        });

        if (
            incremental &&
            nango.lastSyncDate &&
            res.data.results.length &&
            new Date(res.data.results[res.data.results.length - 1].last_edited_time) < nango.lastSyncDate
        ) {
            results = results.concat(res.data.results.filter((result: any) => new Date(result.last_edited_time) >= nango.lastSyncDate!));
            break;
        } else {
            results = results.concat(res.data.results);
        }

        if (!res.data.has_more || !res.data.next_cursor) {
            break;
        } else {
            cursor = res.data.next_cursor;
        }
    }

    return results;
}

function richTextToPlainText(richText: any): string {
    return richText
        .filter((text: any) => text.plain_text)
        .map((text: any) => text.plain_text)
        .join('');
}

function findAllByKey(obj: any, keyToFind: string): string[] {
    return Object.entries(obj).reduce(
        (acc: any, [key, value]: any) =>
            key === keyToFind ? acc.concat([value]) : typeof value === 'object' && value ? acc.concat(findAllByKey(value, keyToFind)) : acc,
        []
    );
}

function mapPage(page: any, plainText: string): NotionPage {
    return {
        id: page.id,
        url: page.url,
        content: plainText,
        parent_page_id: page.parent.page_id
    };
}
